import SwiftUI

private let nightBackground = Color(red: 0.025, green: 0.09, blue: 0.115)
private let panel = Color(red: 0.05, green: 0.15, blue: 0.18)
private let gold = Color(red: 0.82, green: 0.68, blue: 0.40)

struct ContentView: View {
    @State private var fixture = DemoFixture.all[0]
    @State private var maghrib = DemoFixture.all[0].maghribDate
    @State private var fajr = DemoFixture.all[0].fajrDate
    @State private var timeZoneIdentifier = DemoFixture.all[0].timeZone
    @State private var wakeBuffer = 20
    @State private var calculation: NightCalculation?
    @State private var errorMessage: String?
    @State private var showRawJSON = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 28) {
                    hero
                    inputCard
                    if let calculation {
                        overview(calculation)
                        sixPartTimeline(calculation)
                        thirds(calculation)
                        dawudCard(calculation)
                        evidenceCard
                        alarmCard(calculation)
                        developerCard(calculation)
                    } else {
                        ContentUnavailableView(
                            "Ready to calculate",
                            systemImage: "moon.stars",
                            description: Text("Choose a fixture or enter authoritative Maghrib and following-Fajr times.")
                        )
                        .frame(maxWidth: .infinity, minHeight: 240)
                    }
                    disclaimer
                }
                .padding()
            }
            .background(nightBackground.ignoresSafeArea())
            .navigationTitle("Prophetic Night Segments")
            .toolbarColorScheme(.dark, for: .navigationBar)
            .sheet(isPresented: $showRawJSON) {
                RawJSONView(json: calculation?.prettyJSON ?? "{}")
            }
            .onAppear(perform: calculate)
        }
        .tint(gold)
    }

    private var hero: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MAGHRIB → FOLLOWING FAJR")
                .font(.caption.bold())
                .tracking(2)
                .foregroundStyle(gold)
            Text("The night,\nmeasured precisely.")
                .font(.system(size: 44, weight: .regular, design: .serif))
                .minimumScaleFactor(0.75)
            Text("Six exact portions. Three conventional thirds. A provider-agnostic native prototype.")
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 20)
        .accessibilityElement(children: .combine)
    }

    private var inputCard: some View {
        VStack(alignment: .leading, spacing: 18) {
            sectionLabel("01 / CALCULATE")
            Text("Set the night interval").font(.title2.bold())
            Picker("Demonstration fixture", selection: $fixture) {
                ForEach(DemoFixture.all) { fixture in
                    Text(fixture.label).tag(fixture)
                }
            }
            .onChange(of: fixture) { _, value in
                maghrib = value.maghribDate
                fajr = value.fajrDate
                timeZoneIdentifier = value.timeZone
                calculate()
            }
            Text("Demonstration fixture — not a live prayer timetable")
                .font(.caption)
                .foregroundStyle(.secondary)
            DatePicker("Maghrib", selection: $maghrib)
            DatePicker("Following Fajr", selection: $fajr)
            TextField("IANA timezone", text: $timeZoneIdentifier)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Stepper("Fajr preparation: \(wakeBuffer) minutes", value: $wakeBuffer, in: 0...240)
            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.callout)
                    .foregroundStyle(.red)
                    .accessibilityLabel("Calculation error: \(errorMessage)")
            }
            Button(action: calculate) {
                Label("Calculate night", systemImage: "function")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
        }
        .cardStyle()
    }

    private func overview(_ value: NightCalculation) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionLabel("02 / NIGHT MAP")
            Text(fixture.label).font(.title.bold())
            Text("\(clock(value.start)) → \(clock(value.end)) · \(duration(value.durationMilliseconds))")
                .foregroundStyle(.secondary)
        }
    }

    private func sixPartTimeline(_ value: NightCalculation) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Six-part timeline").font(.title2.bold())
            ForEach(value.segments) { segment in
                HStack(alignment: .top, spacing: 14) {
                    Text("0\(segment.number)")
                        .font(.title2.monospacedDigit())
                        .foregroundStyle(gold)
                        .frame(width: 38)
                    VStack(alignment: .leading, spacing: 5) {
                        HStack {
                            Text(segment.label).font(.headline)
                            Spacer()
                            if segment.isWithinLastThird {
                                Text("LAST THIRD")
                                    .font(.caption2.bold())
                                    .tracking(1)
                                    .foregroundStyle(gold)
                            }
                        }
                        Text(segment.dawudActivity.displayName)
                        Text("\(clock(segment.start)) – \(clock(segment.end)) · Third \(segment.thirdMembership)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .padding()
                .background(segment.dawudActivity == .prayer ? gold.opacity(0.12) : panel)
                .overlay(alignment: .leading) {
                    Rectangle()
                        .fill(segment.dawudActivity == .prayer ? gold : Color.secondary)
                        .frame(width: 3)
                }
                .accessibilityElement(children: .combine)
            }
            Text("Part 4 remains in the second third. Parts 5–6 form the mathematical last third.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private func thirds(_ value: NightCalculation) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Three conventional thirds").font(.title2.bold())
            ForEach(value.thirds) { third in
                HStack {
                    VStack(alignment: .leading) {
                        Text(third.label).font(.headline)
                        Text("Parts \(third.includedSegments.map(String.init).joined(separator: " + "))")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Text("\(clock(third.start))\n\(clock(third.end))")
                        .font(.caption.monospacedDigit())
                        .multilineTextAlignment(.trailing)
                }
                .padding()
                .background(third.number == 3 ? gold.opacity(0.15) : panel)
                .clipShape(RoundedRectangle(cornerRadius: 12))
            }
            Label("Last third begins at \(clock(value.lastThird.start)), the beginning of Part 5.", systemImage: "moon.fill")
                .font(.callout)
                .foregroundStyle(gold)
        }
    }

    private func dawudCard(_ value: NightCalculation) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionLabel("DĀWŪD NIGHT PATTERN")
            Text("Sleep · Prayer · Sleep").font(.title2.bold())
            scheduleRow("Initial sleep · Parts 1–3", value.dawudPattern.initialSleep)
            scheduleRow("Prayer · Parts 4–5", value.dawudPattern.prayer)
            scheduleRow("Final sleep · Part 6", value.dawudPattern.finalSleep)
            Divider()
            Text("A scheduling visualisation based on the night pattern attributed to Prophet Dāwūd in Ṣaḥīḥ al-Bukhārī 1131. It is not compulsory or a religious ruling.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .cardStyle()
    }

    private var evidenceCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionLabel("PROPHETIC ROUTINE")
            Text("Evidence, carefully stated").font(.title2.bold())
            Text("An authentic narration from ʿĀʾishah describes the Prophet Muhammad ﷺ sleeping early, rising in the latter part of the night to pray, returning to bed, and rising again at the adhān.")
            Text("This supports the general sleep–pray–sleep–Fajr structure. The exact six-part division shown here maps directly to the separately narrated Dāwūd pattern.")
            Text("Reference: Ṣaḥīḥ al-Bukhārī 1146")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
        .cardStyle()
    }

    private func alarmCard(_ value: NightCalculation) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionLabel("03 / PLAN")
            Text("Suggested markers").font(.title2.bold())
            alarmRow("Beginning of Part 4", value.boundaries[3].instant)
            alarmRow("Beginning of last third", value.lastThird.start)
            alarmRow("Beginning of Part 6", value.boundaries[5].instant)
            alarmRow("Prepare for Fajr", value.dawudPattern.fajrWake.suggestedAlarm)
            Text("These are planning markers only. This prototype does not schedule notifications or claim an optional alarm is required.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .cardStyle()
    }

    private func developerCard(_ value: NightCalculation) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            sectionLabel("04 / INTEGRATE")
            Text("Developer output").font(.title2.bold())
            Text("Inspect the native engine’s exact ISO-encoded result for integration testing.")
                .foregroundStyle(.secondary)
            Button("View raw JSON") { showRawJSON = true }
                .buttonStyle(.bordered)
            ShareLink(item: value.prettyJSON, subject: Text("Prophetic Night Segments result")) {
                Label("Share JSON", systemImage: "square.and.arrow.up")
            }
        }
        .cardStyle()
    }

    private var disclaimer: some View {
        Text("This informational scheduling prototype performs arithmetic on supplied prayer times. It does not calculate astronomical prayer times, issue fatāwā, determine worship validity, or replace qualified guidance.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.vertical)
    }

    private func calculate() {
        do {
            calculation = try NightEngine.calculate(
                NightInput(
                    maghrib: maghrib,
                    fajr: fajr,
                    timeZoneIdentifier: timeZoneIdentifier,
                    fajrWakeBufferMinutes: wakeBuffer
                )
            )
            errorMessage = nil
        } catch {
            calculation = nil
            errorMessage = error.localizedDescription
        }
    }

    private func sectionLabel(_ value: String) -> some View {
        Text(value).font(.caption.bold()).tracking(1.5).foregroundStyle(gold)
    }

    private func clock(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.locale = .autoupdatingCurrent
        formatter.timeZone = TimeZone(identifier: timeZoneIdentifier) ?? .gmt
        formatter.dateStyle = .none
        formatter.timeStyle = .medium
        return formatter.string(from: date)
    }

    private func duration(_ milliseconds: Int64) -> String {
        let minutes = Int((Double(milliseconds) / 60_000).rounded())
        return "\(minutes / 60)h \(minutes % 60)m"
    }

    private func scheduleRow(_ title: String, _ window: TimeWindow) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text("\(clock(window.start)) – \(clock(window.end))")
                .font(.caption.monospacedDigit())
                .foregroundStyle(gold)
        }
    }

    private func alarmRow(_ title: String, _ instant: Date) -> some View {
        HStack {
            Text(title)
            Spacer()
            Text(clock(instant)).font(.body.monospacedDigit()).foregroundStyle(gold)
        }
        .padding(.vertical, 4)
    }
}

private struct RawJSONView: View {
    let json: String
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView([.horizontal, .vertical]) {
                Text(json)
                    .font(.caption.monospaced())
                    .textSelection(.enabled)
                    .padding()
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .background(nightBackground)
            .navigationTitle("Exact JSON")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }
}

private extension View {
    func cardStyle() -> some View {
        padding()
            .background(panel)
            .clipShape(RoundedRectangle(cornerRadius: 18))
            .overlay {
                RoundedRectangle(cornerRadius: 18)
                    .stroke(Color.white.opacity(0.1))
            }
    }
}
