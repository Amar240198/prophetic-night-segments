# Calculation method

The prototype accepts two timezone-aware absolute values: supplied Maghrib `M`, inclusive, and following Fajr `F`, exclusive. It never estimates either prayer time.

```text
Night duration D = F − M
Sixth boundary Bᵢ = M + floor(D × i / 6)
B₆ = F exactly
```

Parts are `[B0,B1) … [B5,B6)`. Deriving every boundary from `M` and `D` avoids drift from repeatedly adding a rounded sixth.

## Layers

```text
Dāwūd pattern:
3/6 sleep + 2/6 prayer + 1/6 sleep
Parts 1–3 + Parts 4–5 + Part 6

Conventional thirds:
2/6 + 2/6 + 2/6
Parts 1–2 + Parts 3–4 + Parts 5–6

Last third:
Parts 5–6
```

Part 4 remains in the second third. The overlap is intentional: the Dāwūd prayer period begins at B3 and crosses into the last third at B4; the final sleep begins at B5.

## Worked example

For 18:00 Maghrib and 00:00 Fajr, `D = 6 hours`. Each part is one hour:

```text
B0 18:00  B1 19:00  B2 20:00  B3 21:00
B4 22:00  B5 23:00  B6 00:00
```

Initial sleep is 18:00–21:00, prayer is 21:00–23:00, final sleep is 23:00–00:00, and the last third is 22:00–00:00.

## Remainders and display

If milliseconds do not divide evenly by six, flooring each rational boundary assigns the indivisible milliseconds deterministically. Segment durations may differ by one millisecond. Exact API values remain integers; displayed times default to minutes and may conceal sub-minute precision.

Explicit-offset ISO timestamps safely cross midnight and offset changes. A night over 18 hours is rejected unless `allowLongNight` explicitly confirms it.
