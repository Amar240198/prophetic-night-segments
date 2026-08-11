import XCTest
@testable import PropheticNightSegments

final class NightEngineTests: XCTestCase {
    func testExactSixHourNight() throws {
        let start = Date(timeIntervalSince1970: 0)
        let result = try NightEngine.calculate(
            NightInput(
                maghrib: start,
                fajr: start.addingTimeInterval(6 * 60 * 60),
                timeZoneIdentifier: "UTC",
                fajrWakeBufferMinutes: 20
            )
        )
        XCTAssertEqual(result.segments.count, 6)
        XCTAssertTrue(result.segments.allSatisfy { $0.durationMilliseconds == 3_600_000 })
        XCTAssertEqual(result.midpoint, start.addingTimeInterval(3 * 60 * 60))
    }

    func testRemainderPreservesExactEndAndContiguity() throws {
        let start = Date(timeIntervalSince1970: 1_000)
        let end = Date(timeIntervalSince1970: 1_000 + 6 * 60 * 60 + 0.005)
        let result = try NightEngine.calculate(
            NightInput(
                maghrib: start,
                fajr: end,
                timeZoneIdentifier: "UTC",
                fajrWakeBufferMinutes: 0
            )
        )
        XCTAssertEqual(result.boundaries.last?.instant, end)
        XCTAssertEqual(
            result.segments.reduce(0) { $0 + $1.durationMilliseconds },
            result.durationMilliseconds
        )
        for index in 1..<result.segments.count {
            XCTAssertEqual(result.segments[index].start, result.segments[index - 1].end)
        }
    }

    func testDomainLayersRemainDistinct() throws {
        let result = try makeResult()
        XCTAssertEqual(result.dawudPattern.initialSleep.segments, [1, 2, 3])
        XCTAssertEqual(result.dawudPattern.prayer.segments, [4, 5])
        XCTAssertEqual(result.dawudPattern.finalSleep.segments, [6])
        XCTAssertEqual(result.lastThird.segments, [5, 6])
        XCTAssertFalse(result.segments[3].isWithinLastThird)
        XCTAssertTrue(result.segments[4].isWithinLastThird)
    }

    func testOffsetChangeUsesAbsoluteDuration() throws {
        let parser = ISO8601DateFormatter()
        let result = try NightEngine.calculate(
            NightInput(
                maghrib: parser.date(from: "2026-10-24T23:00:00+01:00")!,
                fajr: parser.date(from: "2026-10-25T05:00:00+00:00")!,
                timeZoneIdentifier: "Europe/London",
                fajrWakeBufferMinutes: 0
            )
        )
        XCTAssertEqual(result.durationMilliseconds, 7 * 60 * 60 * 1_000)
    }

    func testValidation() {
        let start = Date()
        XCTAssertThrowsError(
            try NightEngine.calculate(
                NightInput(
                    maghrib: start,
                    fajr: start,
                    timeZoneIdentifier: "UTC",
                    fajrWakeBufferMinutes: 0
                )
            )
        ) { XCTAssertEqual($0 as? NightValidationError, .fajrNotAfterMaghrib) }
        XCTAssertThrowsError(
            try NightEngine.calculate(
                NightInput(
                    maghrib: start,
                    fajr: start.addingTimeInterval(3_600),
                    timeZoneIdentifier: "Invalid/Zone",
                    fajrWakeBufferMinutes: 0
                )
            )
        ) { XCTAssertEqual($0 as? NightValidationError, .invalidTimeZone) }
    }

    private func makeResult() throws -> NightCalculation {
        let start = Date(timeIntervalSince1970: 0)
        return try NightEngine.calculate(
            NightInput(
                maghrib: start,
                fajr: start.addingTimeInterval(6 * 60 * 60),
                timeZoneIdentifier: "UTC",
                fajrWakeBufferMinutes: 0
            )
        )
    }
}
