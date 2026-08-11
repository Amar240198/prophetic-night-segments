import Foundation

enum DawudActivity: String, Codable, Sendable {
    case initialSleep = "initial-sleep"
    case prayer
    case finalSleep = "final-sleep"

    var displayName: String {
        switch self {
        case .initialSleep: "Initial sleep"
        case .prayer: "Prayer"
        case .finalSleep: "Final sleep"
        }
    }
}

struct NightInput: Sendable {
    let maghrib: Date
    let fajr: Date
    let timeZoneIdentifier: String
    let fajrWakeBufferMinutes: Int
    var allowLongNight = false
}

struct NightBoundary: Codable, Identifiable, Sendable {
    let index: Int
    let label: String
    let instant: Date
    var id: Int { index }
}

struct NightSegment: Codable, Identifiable, Sendable {
    let number: Int
    let label: String
    let start: Date
    let end: Date
    let durationMilliseconds: Int64
    let durationSeconds: Double
    let thirdMembership: Int
    let dawudActivity: DawudActivity
    let isWithinLastThird: Bool
    var id: Int { number }
}

struct NightThird: Codable, Identifiable, Sendable {
    let number: Int
    let label: String
    let start: Date
    let end: Date
    let durationMilliseconds: Int64
    let includedSegments: [Int]
    var id: Int { number }
}

struct TimeWindow: Codable, Sendable {
    let start: Date
    let end: Date
    let segments: [Int]
}

struct FajrWake: Codable, Sendable {
    let suggestedAlarm: Date
    let fajr: Date
    let bufferMinutes: Int
}

struct DawudPattern: Codable, Sendable {
    let initialSleep: TimeWindow
    let prayer: TimeWindow
    let finalSleep: TimeWindow
    let fajrWake: FajrWake
    let sourceReference: String
    let disclaimer: String
}

struct LastThird: Codable, Sendable {
    let label: String
    let start: Date
    let end: Date
    let segments: [Int]
}

struct NightCalculation: Codable, Sendable {
    let start: Date
    let end: Date
    let durationMilliseconds: Int64
    let boundaries: [NightBoundary]
    let segments: [NightSegment]
    let thirds: [NightThird]
    let midpoint: Date
    let lastThird: LastThird
    let dawudPattern: DawudPattern

    var prettyJSON: String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        return (try? encoder.encode(self)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }
}

enum NightValidationError: LocalizedError, Equatable {
    case invalidTimeZone
    case fajrNotAfterMaghrib
    case nightTooLong
    case invalidWakeBuffer
    case wakeBufferExceedsNight

    var errorDescription: String? {
        switch self {
        case .invalidTimeZone: "Choose a valid IANA timezone."
        case .fajrNotAfterMaghrib: "Fajr must occur after Maghrib as an absolute instant."
        case .nightTooLong: "The night exceeds 18 hours. Confirm an unusually long interval explicitly."
        case .invalidWakeBuffer: "The Fajr preparation buffer cannot be negative."
        case .wakeBufferExceedsNight: "The Fajr preparation buffer cannot exceed the night."
        }
    }
}

enum NightEngine {
    static let maximumStandardNightMilliseconds: Int64 = 18 * 60 * 60 * 1_000

    /// Pure, deterministic segmentation. Every boundary is derived from the original
    /// epoch-millisecond interval; the final boundary is exactly the supplied Fajr.
    static func calculate(_ input: NightInput) throws -> NightCalculation {
        guard TimeZone(identifier: input.timeZoneIdentifier) != nil else {
            throw NightValidationError.invalidTimeZone
        }
        guard input.fajrWakeBufferMinutes >= 0 else {
            throw NightValidationError.invalidWakeBuffer
        }

        let start = epochMilliseconds(input.maghrib)
        let end = epochMilliseconds(input.fajr)
        guard end > start else { throw NightValidationError.fajrNotAfterMaghrib }
        let duration = end - start
        guard input.allowLongNight || duration <= maximumStandardNightMilliseconds else {
            throw NightValidationError.nightTooLong
        }
        guard Int64(input.fajrWakeBufferMinutes) * 60_000 <= duration else {
            throw NightValidationError.wakeBufferExceedsNight
        }

        let points = (0...6).map { index -> Int64 in
            index == 6 ? end : start + duration * Int64(index) / 6
        }
        let boundaries = points.enumerated().map { index, instant in
            NightBoundary(
                index: index,
                label: index == 0 ? "Maghrib" : index == 6 ? "Fajr" : "Boundary \(index)",
                instant: date(milliseconds: instant)
            )
        }
        let activities: [DawudActivity] = [
            .initialSleep, .initialSleep, .initialSleep, .prayer, .prayer, .finalSleep,
        ]
        let segments = (0..<6).map { index in
            let segmentStart = points[index]
            let segmentEnd = points[index + 1]
            let number = index + 1
            return NightSegment(
                number: number,
                label: "Part \(number)",
                start: date(milliseconds: segmentStart),
                end: date(milliseconds: segmentEnd),
                durationMilliseconds: segmentEnd - segmentStart,
                durationSeconds: Double(segmentEnd - segmentStart) / 1_000,
                thirdMembership: index / 2 + 1,
                dawudActivity: activities[index],
                isWithinLastThird: number >= 5
            )
        }
        let thirdNames = ["First third", "Second third", "Last third"]
        let thirds = (0..<3).map { index in
            NightThird(
                number: index + 1,
                label: thirdNames[index],
                start: date(milliseconds: points[index * 2]),
                end: date(milliseconds: points[index * 2 + 2]),
                durationMilliseconds: points[index * 2 + 2] - points[index * 2],
                includedSegments: [index * 2 + 1, index * 2 + 2]
            )
        }
        let wake = end - Int64(input.fajrWakeBufferMinutes) * 60_000
        return NightCalculation(
            start: date(milliseconds: start),
            end: date(milliseconds: end),
            durationMilliseconds: duration,
            boundaries: boundaries,
            segments: segments,
            thirds: thirds,
            midpoint: date(milliseconds: points[3]),
            lastThird: LastThird(
                label: "Last Third of the Night",
                start: date(milliseconds: points[4]),
                end: date(milliseconds: points[6]),
                segments: [5, 6]
            ),
            dawudPattern: DawudPattern(
                initialSleep: TimeWindow(
                    start: date(milliseconds: points[0]),
                    end: date(milliseconds: points[3]),
                    segments: [1, 2, 3]
                ),
                prayer: TimeWindow(
                    start: date(milliseconds: points[3]),
                    end: date(milliseconds: points[5]),
                    segments: [4, 5]
                ),
                finalSleep: TimeWindow(
                    start: date(milliseconds: points[5]),
                    end: date(milliseconds: points[6]),
                    segments: [6]
                ),
                fajrWake: FajrWake(
                    suggestedAlarm: date(milliseconds: wake),
                    fajr: date(milliseconds: end),
                    bufferMinutes: input.fajrWakeBufferMinutes
                ),
                sourceReference: "Ṣaḥīḥ al-Bukhārī 1131",
                disclaimer: "A scheduling visualisation based on the night pattern attributed to Prophet Dāwūd. It is not a compulsory practice or religious ruling."
            )
        )
    }

    private static func epochMilliseconds(_ date: Date) -> Int64 {
        Int64((date.timeIntervalSince1970 * 1_000).rounded())
    }

    private static func date(milliseconds: Int64) -> Date {
        Date(timeIntervalSince1970: Double(milliseconds) / 1_000)
    }
}
