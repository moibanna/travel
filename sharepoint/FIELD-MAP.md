# Record schema → SharePoint columns

The canonical record shape is `BLANK` in the tracker (now ported to
`src/core/types.ts`). SharePoint internal names are **identical to the app's
field names**, so the storage adapter is a straight pass-through with no
mapping table to drift out of date.

Run `Setup-TravelLists.ps1` to create these columns.

## Travel Movements

| App field | SharePoint | Type | Notes |
|---|---|---|---|
| `no` | `RefNo` — *No.* | Number | Indexed. The reference everyone already quotes. |
| `name` | `Title` — *Passenger* | Text | The built-in Title column, renamed. Indexed and searchable by default. |
| `employeeType` | `EmployeeType` | Choice | Direct employee, Contractor. |

### Arrival leg

| App field | SharePoint | Type | Notes |
|---|---|---|---|
| `arrDate` | `ArrDate` — *Arrival* | Date | Indexed. |
| `arrTime` | `ArrTime` | Text | 24-hour `HH:MM`. See *Why time is text*. |
| `arrAirport` | `ArrAirport` | Choice | Erbil (EIA), Mardin, Shirnak. |
| `arrDest` | `ArrDest` — *Arrival route* | Text | `EIA to Ramada Hotel`. |
| `arrFlight` | `ArrFlight` | Text | Split out of the combined cell. |
| `arrStatus` | `ArrStatus` | Choice | On schedule, Delayed, Earlier, Revised, Changed, Missed connection, Cancelled. |
| `arrChangeBy` | `ArrChangeBy` | Choice | Airline, Travel agent, Us, Traveller. |
| `arrDriver` | `ArrDriver` | Text | |
| `arrDriverType` | `ArrDriverType` | Choice | Team driver, Normal driver. |
| `arrDone` | `ArrDone` — *Arrived* | Yes/No | |

### Departure leg

| App field | SharePoint | Type | Notes |
|---|---|---|---|
| `depDate` | `DepDate` — *Departure* | Date | Indexed. |
| `depTime` | `DepTime` | Text | |
| `depPickup` | `DepPickup` — *Pickup time* | Text | **Blank means "use the calculated time".** Filled in only to override the rules. |
| `depPickupConfirmed` | `DepPickupConfirmed` | Note | JSON `{ at, by }` — when the pickup was agreed with the passenger, and by whom. |
| `depAirport` | `DepAirport` | Choice | |
| `depDest` | `DepDest` — *Departure route* | Text | `Ramada Hotel to EIA`. The part before "to" drives the drive time. |
| `depFlight` | `DepFlight` | Text | |
| `depStatus` | `DepStatus` | Choice | |
| `depChangeBy` | `DepChangeBy` | Choice | |
| `depDriver` | `DepDriver` | Text | |
| `depDriverType` | `DepDriverType` | Choice | |
| `depDone` | `DepDone` — *Departed* | Yes/No | |

### Request provenance

| App field | SharePoint | Type | Notes |
|---|---|---|---|
| `emailDate` | `EmailDate` | Date | The Master Sheet's `E-Mail date`. |
| `receivedFrom` | `ReceivedFrom` | Choice | KT, TRF. |
| `regBy` | `RegBy` — *Registered by* | Choice | Indexed. Mohammed, Idrees, Zana, Omid, Farhang, Kamiran. |
| `service` | `Service` | Choice | FT (First Terminal), Meet & Greet, CIP. Feeds the pickup calculation. |
| `remarks` | `Remarks` | Note | |
| — | `SourceRow` | Number | Master Sheet row, so anything odd can be traced back. |

## Deliberately not stored as columns

| App field | Why |
|---|---|
| `arrCheck`, `depCheck` | Results of a live flight lookup. Transient suggestions a person accepts or discards — not a record of fact. Keep in the Settings list keyed by record id, or drop them on save. |
| `arrReminded`, `depReminded` | Per-device reminder bookkeeping. Meaningless once reminders move to a Power Automate flow. |
| record status | **Derived, never stored.** `statusOf()` computes today / open / upcoming / completed from the dates and the done flags. Storing it would let it drift. |
| pickup time | **Derived** unless overridden. `pickupFor()` calculates it; only `depPickup` is stored, and only when someone overrides the rules. |

## Splitting the Master Sheet's `Flight A/D`

One cell holds both legs, stating the airline code once when both legs share a
carrier. `splitFlights()` handles it, and is covered by tests:

| Cell | `arrFlight` | `depFlight` |
|---|---|---|
| `TK804/317` | `TK804` | `TK 317` |
| `QR451/ 450` | `QR451` | `QR 450` |
| `G 9357 / G 9358` | `G 9357` | `G 9358` |
| `RJ 824/TK317` | `RJ 824` | `TK317` |
| `Flydubai 209/204` | `FLYDUBAI 209` | `FLYDUBAI 204` |
| `EK 270` *(both legs booked)* | `EK 270` | *(empty)* |

The last row is deliberate: with one number and two legs, the departure is left
blank rather than guessed. A wrong flight number on a departure is worse than
an empty one.

## Why time is text, not a Time column

A SharePoint time column cannot hold "not yet confirmed", and a good share of
arrivals have no confirmed time when the request first lands. Forcing a time
would mean either inventing one or leaving the field empty — and empty cannot
be told apart from "nobody has filled this in yet".

Text in strict 24-hour `HH:MM` also sidesteps the AM/PM problem: a native time
picker follows the device's regional setting, so `5:15` on one phone and
`17:15` on another is a real risk with flight times.

## The 5 MB ceiling does not apply here

The current app stores every record as one JSON blob in artifact storage,
which caps out around 5 MB — that is what forced the cut to 229 records from
1 July 2026 onward.

SharePoint stores one item per movement, so all 9,116 usable rows fit. The
5,000-item *view* threshold is a different thing and is handled by the indexes
the setup script creates on `RefNo`, `ArrDate`, `DepDate` and `RegBy`.

## Correction to my earlier note

I previously asked whether `Muhammed` and `Mohammed` were the same person.
**The app has already answered this**: `REG_OPTIONS` lists one `Mohammed`, and
`Omed` has been normalised to `Omid`. The import cleaning merged them. No
decision needed.
