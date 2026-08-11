import Foundation

struct DemoFixture: Identifiable, Hashable {
    let id: String
    let label: String
    let maghrib: String
    let fajr: String
    let timeZone: String

    static let all: [DemoFixture] = [
        .init(id: "london-summer", label: "London — summer", maghrib: "2026-07-23T21:02:00+01:00", fajr: "2026-07-24T03:15:00+01:00", timeZone: "Europe/London"),
        .init(id: "london-winter", label: "London — winter", maghrib: "2026-12-15T15:54:00+00:00", fajr: "2026-12-16T05:52:00+00:00", timeZone: "Europe/London"),
        .init(id: "makkah", label: "Makkah", maghrib: "2026-02-14T18:19:00+03:00", fajr: "2026-02-15T05:36:00+03:00", timeZone: "Asia/Riyadh"),
        .init(id: "jakarta", label: "Jakarta", maghrib: "2026-04-12T17:54:00+07:00", fajr: "2026-04-13T04:39:00+07:00", timeZone: "Asia/Jakarta"),
        .init(id: "oslo-summer", label: "Oslo — summer", maghrib: "2026-06-10T22:32:00+02:00", fajr: "2026-06-11T02:24:00+02:00", timeZone: "Europe/Oslo"),
        .init(id: "sydney", label: "Sydney", maghrib: "2026-08-20T17:30:00+10:00", fajr: "2026-08-21T05:18:00+10:00", timeZone: "Australia/Sydney"),
        .init(id: "kathmandu", label: "Kathmandu", maghrib: "2026-03-08T18:11:00+05:45", fajr: "2026-03-09T05:12:00+05:45", timeZone: "Asia/Kathmandu"),
    ]

    var maghribDate: Date { Self.parse(maghrib) }
    var fajrDate: Date { Self.parse(fajr) }

    private static func parse(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter.date(from: value)!
    }
}
