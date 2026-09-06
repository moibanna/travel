# Master Sheet → SharePoint column map

How every column of the `Flights` tab lands in the **Travel Movements** list, and
what gets cleaned on the way in. Run `Setup-TravelLists.ps1` first — it creates
the columns on the right-hand side.

## The mapping

| Master Sheet column | SharePoint column | Type | Notes |
|---|---|---|---|
| `No.` | **No.** (`RefNo`) | Number | Indexed. Stays the reference everyone already quotes. |
| `Name` | **Passenger** (`Title`) | Text | The built-in Title column, renamed. Indexed and searchable by default. |
| `Arrival ` | **Arrival** (`ArrivalDate`) | Date | Indexed. Date only — no time component. |
| `Time` (first) | **Arrival time** (`ArrivalTime`) | Text | 24-hour `HH:MM`. See *Why time is text* below. |
| `Destination` (first) | **Arrival route** (`ArrivalRoute`) | Text | e.g. `EIA to Ramada`. |
| `Departure` | **Departure** (`DepartureDate`) | Date | Indexed. |
| `Time` (second) | **Departure time** (`DepartureTime`) | Text | |
| `Destination` (second) | **Departure route** (`DepartureRoute`) | Text | e.g. `Ramada to EIA`. |
| `Flight A/D` | **Arrival flight** + **Departure flight** | Text ×2 | Split into two. See *Splitting Flight A/D*. |
| `E-Mail date` | **Request received** (`RequestDate`) | Date | |
| `Received From` | **Received from** (`ReceivedFrom`) | Text | `KT`, `TRF`, `Movcon`, or a person's name. |
| `Reg by` | **Registered by** (`RegisteredBy`) | Choice | Indexed. |
| `Remarks` | **Remarks** + **Service** + **Flight status** + **TRF received** | mixed | Four columns out of one. See *Unpacking Remarks*. |
| — | **Airport** (`Airport`) | Choice | Derived from the route text: `Mardin`, `Shirnak`, otherwise `EIA`. |
| — | **Status** (`MovementStatus`) | Choice | Indexed. Derived from the dates. |
| — | **Completed** (`Completed`) | Yes/No | Past-dated movements import already ticked. |
| — | **Master Sheet row** (`SourceRow`) | Number | So anything that looks wrong can be traced back to the original row. |

## Splitting `Flight A/D`

The column packs both flights into one cell, and states the airline code once
where both legs use the same carrier:

| Cell | Arrival flight | Departure flight |
|---|---|---|
| `TK804/317` | `TK804` | `TK317` |
| `QR451/ 450` | `QR451` | `QR450` |
| `G 9357 / G 9358` | `G 9357` | `G 9358` |
| `RJ 824/TK317` | `RJ 824` | `TK317` |
| `EK 270` | `EK 270` | *(empty — one way)* |

The rule: split on `/`; if the second half is digits only, it inherits the
letters from the first half. An explicitly stated second carrier always wins.

Two columns rather than one is the point of the exercise — it lets you filter
by carrier, count arrivals per airline, and spot a leg with no flight recorded.

## Unpacking `Remarks`

`Remarks` is free text that has accumulated several meanings. They separate as:

| Found in Remarks | Goes to | Remarks keeps |
|---|---|---|
| `CIP` | **Service** = `CIP` | the rest of the text |
| `FT` | **Service** = `FT` | the rest of the text |
| `NJ` | **Service** = `NJ` | the rest of the text |
| `No TRF yet` | **TRF received** = unticked | the rest of the text |
| `Cancelled` | **Flight status** = `Cancelled` | the rest of the text |
| `Revised`, `Dep Updated - 14-8-2026` | **Flight status** = `Revised` | the full note, dates included |

Anything not recognised stays in **Remarks** untouched. Nothing is discarded.

## Why time is text, not a Time column

A real SharePoint time column cannot hold `TBC`, and roughly one arrival in six
has no confirmed time when the request first lands. Forcing a time would mean
either inventing one or leaving the field empty — and empty cannot be told apart
from "nobody has filled this in yet".

Text in strict 24-hour `HH:MM` keeps `TBC` expressible and sorts correctly as a
string. It also sidesteps the AM/PM problem: a native time picker follows the
phone's regional setting, so `5:15` on one person's device and `17:15` on
another's is a real risk with flight times.

## Cleaning applied on import

- Routes normalised: bare `TBC` becomes `EIA to TBC`; a bare hotel name like
  `Divan` becomes `Divan Hotel to EIA` on the departure leg.
- Airport read out of the route text where the source names `Mardin` or
  `Shirnak`, otherwise `EIA`.
- Source spellings tidied: `kt` and `Kurdistan T` → `KT`; `Kmairan` → `Kamiran`.
- Names reordered: `MCLEAN, DARREN JAMES` → `Darren James Mclean`.
- Dates parsed from every form the sheet uses: `28-Oct-26`, `14-Aug`,
  `2026-01-10`, `10/01/2026` (day first) and Excel serial numbers.

## Two things left for you to decide

1. **`Muhammed` (440 rows) and `Mohammed` (1,295 rows)** both appear in
   `Reg by`. Both are currently separate options in the **Registered by**
   column. If they are one person, say so and the import merges them.
2. **How much history to load.** All 9,116 usable rows fit in SharePoint — the
   5 MB browser limit that forced a cut-off no longer applies. The only reason
   to load a shorter window is to keep the list tidy. The list view threshold
   is handled by the indexes the setup script creates, so volume is not a
   performance problem.

## Known gaps in the source data

- 39 rows have an arrival date but no destination; 35 the same on departure.
  The source cells were blank or said `None`. They import fine and show an
  empty route.
