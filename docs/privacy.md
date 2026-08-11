# Privacy statement

Manual calculations send the supplied timetable interval to the application API. Coordinate calculations additionally send latitude, longitude, timezone, service date, calculation method, and selected timetable source to the application API. For astronomical calculations, the server forwards the relevant values to its configured prayer-time provider (`islamic.app` by default). London Unified calculations use the bundled annual timetable and do not forward coordinates to another provider. Browser location access is optional and only starts after the user selects “Use my precise location”; coordinates can always be entered manually. The application does not retain coordinates, but production operators and remote providers may process network metadata and must publish an appropriate retention policy.

The prototype requires no account, login, email, analytics, or advertising identifier and does not persist submitted values. Application code must not log request bodies. Manual mode remains available.

A production operator must publish its operator identity, retention policy, subprocessors, provider disclosure, lawful basis, deletion process, and region-specific privacy terms. Clients should minimise coordinate precision to what the selected provider needs.
