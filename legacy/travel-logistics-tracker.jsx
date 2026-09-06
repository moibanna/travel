import React, { useState, useEffect, useMemo, useRef } from "react";
import Papa from "papaparse";

/* ------------------------------------------------------------------ */
/*  Travel Logistics Tracker — movement board + passenger records      */
/*  Modeled on the daily arrival/departure sheet (EIA rotations).      */
/* ------------------------------------------------------------------ */

const STORE_KEY = "tlt:records-v1";

const LOCATIONS = [
  "Erbil Apartment", "Home", "Divan Hotel", "Ramada Hotel", "EIH",
  "Arjan Rotana", "Rotana", "PSK", "TBC", "TWK", "RC", "FSK",
  "Duhok", "Zakho", "Field",
];
const ARR_DESTS = LOCATIONS.map((l) => `EIA to ${l}`);
const DEP_DESTS = LOCATIONS.map((l) => `${l} to EIA`);
const SERVICE_OPTIONS = ["FT", "Meet & Greet", "CIP"];
/* FT is the First Terminal service; spelled out wherever there is room for it */
const SERVICE_LABEL = { FT: "First Terminal", CIP: "CIP", "Meet & Greet": "Meet & Greet" };
const serviceLabel = (v) => SERVICE_LABEL[v] || v;
/* "Divan Hotel to EIA" reads better as an arrow on the board */
const routeArrow = (d) => String(d || "").replace(/\s+to\s+/i, " → ");
const FLIGHT_STATUSES = ["On schedule", "Delayed", "Earlier", "Revised", "Changed", "Missed connection", "Cancelled"];
/* a status says WHAT happened to the flight; this says WHO caused it, so a flight
   the airline cancelled reads differently from one the office cancelled */
const CHANGE_SOURCES = ["Airline", "Travel agent", "Us", "Traveller"];
const RECEIVED_OPTIONS = ["KT", "TRF"];
const REG_OPTIONS = ["Mohammed", "Idrees", "Zana", "Omid", "Farhang", "Kamiran"];
const DRIVER_TYPES = ["Team driver", "Normal driver"];
const EMPLOYEE_TYPES = ["Direct employee", "Contractor"];
const AIRPORTS = ["Erbil (EIA)", "Mardin", "Shirnak"];
const airportShort = (a) => (a === "Erbil (EIA)" ? "EIA" : a);

const BLANK = {
  name: "", employeeType: "",
  arrDate: "", arrTime: "", arrAirport: "Erbil (EIA)", arrDest: "", arrDriver: "", arrDriverType: "", arrDone: false,
  depDate: "", depTime: "", depPickup: "", depAirport: "Erbil (EIA)", depDest: "", depDriver: "", depDriverType: "", depDone: false,
  arrFlight: "", arrStatus: "On schedule", arrChangeBy: "", arrCheck: null, arrReminded: null,
  depFlight: "", depStatus: "On schedule", depChangeBy: "", depCheck: null, depReminded: null,
  depPickupConfirmed: null, /* { at, by } once agreed with the passenger */
  emailDate: "", receivedFrom: "",
  service: "", regBy: "", remarks: "",
};

/* older saved records may not have the newer fields yet */
/* older saved records kept one flight number and one status for both legs */
function migrate(r) {
  const m = { ...BLANK, arrAirport: "", depAirport: "", no: r.no, id: r.id, ...r };
  if (r.flight && !r.arrFlight && !r.depFlight) {
    const sp = splitFlights(r.flight, !!r.arrDate, !!r.depDate);
    m.arrFlight = sp.arr; m.depFlight = sp.dep;
  }
  if (r.flightStatus) {
    if (!r.arrStatus && r.arrDate) m.arrStatus = r.flightStatus;
    if (!r.depStatus && r.depDate) m.depStatus = r.flightStatus;
  }
  if (r.lastCheck && !r.arrCheck && !r.depCheck) {
    if (r.lastCheck.leg === "DEP") m.depCheck = r.lastCheck; else m.arrCheck = r.lastCheck;
  }
  m.arrStatus = m.arrStatus || "On schedule";
  m.depStatus = m.depStatus || "On schedule";
  delete m.flight; delete m.flightStatus; delete m.lastCheck;
  return m;
}

/* ------------------------------------------------------------------ */
/*  Starting data — 229 live records carried over from the Master      */
/*  Sheet (every movement from 1 Jul 2026 onward, cleaned).            */
/*  Columns: no, name, arrDate, arrTime, arrAirport, arrDest, arrDone, */
/*  depDate, depTime, depAirport, depDest, depDone, emailDate,         */
/*  receivedFrom, flight (split per leg), status, service, regBy,      */
/*  remarks.                                                          */
/*  Airport codes: E = Erbil (EIA), M = Mardin, S = Shirnak.           */
/* ------------------------------------------------------------------ */
const AP_CODE = { E: "Erbil (EIA)", M: "Mardin", S: "Shirnak", "": "" };
const MASTER_ROWS = [[8954,"KANNAN SHANMUGAIH","2026-05-12","11:25","E","EIA to TBC",1,"2026-07-02","12:05","E","TBC to EIA",1,"2026-04-30","KT","G 9357/9358","","","Farhang","Dep Updated 08-06-2026"],[8976,"Ariel Jungco","2026-06-17","03:15","E","EIA to Ramada Hotel",1,"2026-07-14","22:00","E","TBC to EIA",1,"2026-05-10","KT","QR454/451","","","Kamiran",""],[8983,"BRETT ANTHONY CHARLES","2026-06-04","04:45","E","",1,"2026-07-03","05:40","E","Ramada Hotel to EIA",1,"2026-05-12","KT","TK 804/317","","","Farhang",""],[8995,"HUDSON STEVEN","2026-06-03","04:45","E","EIA to Wing",1,"2026-07-02","01:40","E","Wing to EIA",1,"2026-05-18","KT","TK 804 / TK 317","","FT","Idrees",""],[8998,"KEVIN ALBERT MEEHAN","2026-06-30","21:00","E","EIA to Wing",1,"2026-08-19","04:20","E","Wing to EIA",1,"2026-05-18","KT","QR 450 / QR 455","","FT","Idrees",""],[9003,"Kurtis Maser","2026-06-03","15:50","E","EIA to Ramada Hotel",1,"2026-07-02","09:55","E","Ramada Hotel to EIA",1,"2026-05-20","KT","TK 315/EK2070","","","Kamiran",""],[9005,"PIERRE YVES MARCEL JEAN DESQUET","2026-06-03","13:15","E","EIA to Team",1,"2026-07-05","22:00","E","TBC to EIA",1,"2026-05-25","KT","QR 450/451","","","Farhang",""],[9009,"SELVAKUMAR CHINNADURAI","2026-06-03","13:15","E","EIA to Team",1,"2026-07-02","12:05","E","TBC to EIA",1,"2026-05-26","KT","G 9357/9358","","","Farhang",""],[9013,"Andrew Sami","2026-07-28","14:00","E","EIA to RC",1,"2026-06-25","22:00","E","RC to EIA",1,"2026-05-31","KT","2070 / QR 451","","CIP","Idrees","Updated 25/07"],[9016,"Kevin Pearce","2026-06-11","10:25","M","Istanbul to Mardin",1,"2026-07-09","22:00","E","TBC to EIA",1,"2026-06-01","KT","TK 2674 / QR 451","","","Kamiran","Arrival updated 08-06-2026"],[9018,"Rakesh Kumar","2026-07-02","11:25","E","EIA to TBC",1,"2026-08-06","12:05","E","TBC to EIA",1,"2026-06-01","KT","G 9357/9358","","","Kamiran",""],[9019,"Nigel Robert Nichol","2026-06-06","04:45","E","EIA to TBC",1,"2026-07-04","01:40","E","Ramada Hotel to EIA",1,"2026-06-02","KT","TK 804/317","","","Kamiran",""],[9021,"TIMOTHY DAVID FEENEY","2026-06-11","10:25","M","Istanbul to Mardin",1,"2026-07-16","01:40","E","TBC to EIA",1,"2026-06-03","KT","TK 2674/317","","","Kamiran","Arrival updated 08-06-2026"],[9022,"Joseph Hector Macinnis","2026-06-11","19:20","M","Istanbul to Mardin",1,"2026-07-08","05:40","E","Ramada Hotel to EIA",1,"2026-06-03","KT","TK 2678/TK 805","","","Kamiran","Arrival updated 08-06-2026"],[9023,"Derek Wesley Dosreis","2026-07-01","04:45","E","EIA to TBC",1,"2026-07-29","20:05","M","Mardin to Istanbul",1,"2026-06-03","KT","TK 804/ TK 2679","","FT","Kamiran","DP updated 26-July"],[9024,"Akhilesh Babu Akhilesh Babu","2026-06-11","19:20","M","Istanbul to Mardin",1,"2026-07-10","12:05","E","TBC to EIA",1,"2026-06-03","KT","G 9357/9358","Cancelled","","Kamiran","Cancelled"],[9025,"Martin Issott","2026-06-17","13:05","E","EIA to TBC",1,"2026-07-10","12:05","E","TBC to EIA",1,"2026-06-03","KT","G 9357/9358","","","Kamiran",""],[9026,"DAVID PAUL FOWLER","2026-06-17","13:05","E","EIA to TBC",1,"2026-07-16","01:40","E","Ramada Hotel to EIA",1,"2026-06-03","KT","TK 317/ G9357","","","Kamiran",""],[9027,"Eko Setiyo Pratmana","2026-06-11","10:25","M","Istanbul to Mardin",1,"2026-07-09","16:50","E","TBC to EIA",1,"2026-06-03","KT","TK 2674 / 2071","","","Kamiran","Arrival updated 08-06-2026"],[9028,"HERMANS FRANS ANTOINE","2026-06-11","10:25","M","Istanbul to Mardin",1,"2026-07-10","22:00","E","TBC to EIA",1,"2026-06-03","KT","TK 2674 / QR 451","Cancelled","","Kamiran","Cancelled"],[9242,"Jeganathan Selva Sivalingam","2026-06-18","11:25","E","EIA to TBC",1,"2026-07-18","12:05","E","TBC to EIA",1,"2026-06-03","KT","G 9357 /9358","","","Kamiran",""],[9243,"Michael Akash Michael Jerold Simon","2026-06-04","11:25","E","EIA to TBC",1,"2026-07-18","12:05","E","TBC to EIA",1,"2026-06-03","KT","G 9357 /9358","","","Kamiran",""],[9244,"RAVIKUMAR VETHAMONICKAM","2026-06-30","11:25","E","EIA to TBC",1,"2026-08-06","12:05","E","TBC to EIA",1,"2026-06-03","KT","G 9357 /9358","","","Kamiran",""],[9245,"Balachandar Pandu Rangan","2026-06-11","19:20","M","Istanbul to Mardin",1,"2026-07-23","12:05","E","TBC to EIA",1,"2026-06-03","KT","TK 2678/G9358","","","Kamiran","Arrival updated 08-06-2026"],[9246,"Beemachandran Thangavel","2026-06-11","19:20","M","Istanbul to Mardin",1,"2026-07-09","12:05","E","TBC to EIA",1,"2026-06-03","KT","TK 2678 /G 9358","","","Kamiran","Arrival updated 08-06-2026"],[9248,"KUMARA SWAMY","2026-06-11","19:20","M","Istanbul to Mardin",1,"2026-07-09","12:05","E","TBC to EIA",1,"2026-06-03","KT","TK 2678/G 9358","","","Kamiran","Arrival updated 08-06-2026"],[9249,"UDHAYAKUMAR ALAGARSAMY","2026-06-30","11:25","E","EIA to TBC",1,"2026-07-30","12:05","E","TBC to EIA",1,"2026-06-08","KT","G 9357 /9358","","","Idrees",""],[9250,"RAINER MARKUS","2026-06-16","04:45","E","EIA to Team",1,"2026-07-18","01:40","E","Ramada Hotel to EIA",1,"2026-06-07","KT","TK 804/315","","","Farhang","Dep updated 13-07-2026"],[9252,"ROSS AITKEN STEPHEN","2026-06-17","04:45","E","EIA to Wing",1,"2026-09-09","05:40","E","Wing to EIA",0,"2026-06-10","KT","TK 804 / TK 805","","FT","Idrees",""],[9253,"ROSS AITKEN STEPHEN","2026-08-12","10:35","E","EIA to Wing",1,"2026-07-15","09:55","E","Wing to EIA",1,"2026-06-10","KT","TK / TK 315","","FT","Idrees",""],[9254,"Pravin Dattaram Karanjavkar","2026-06-20","11:25","E","EIA to TBC",1,"2026-07-19","13:55","E","TBC to EIA",1,"2026-06-10","KT","G 9357/ G 9358","","","Idrees",""],[9255,"Baraa Hekma","2026-07-07","12:40","E","EIA to Home",1,"2026-06-13","09:55","E","Ankawa to EIA",1,"2026-06-14","TRF","TK316/315","","","Omid","TRF /Arrival updated 03-07-26 kak nabaz"],[9256,"Andrew Scott Gutleber","2026-07-01","09:00","E","EIA to TBC",1,"2026-08-08","09:55","E","07:10 Ramada to EIA (need passport)",1,"2026-06-14","KT","TK314/315","","","Omid","Dep Updated 14-07-2026/Dep update 23-07-26"],[9257,"Dmitriy Usoltsev","2026-06-25","04:45","E","EIA to TBC",1,"2026-07-23","09:55","E","TBC to EIA",1,"2026-06-15","KT","TK804/315","","FT","Kamiran",""],[9258,"Graeme Nixon","2026-06-24","03:15","E","EIA to RC",1,"2026-07-24","17:30","E","RC to EIA",1,"2026-07-19","KT","QR454/Et 2397","","FT","Kamiran","Dep Updated/Dep update 23-07"],[9259,"Darren McLean","2026-08-08","13:10","E","EIA to Wings",1,"2026-08-18","14:40","E","TBC to EIA",1,"2026-06-15","KT","QR450/455","","","Kamiran","Updated 13-8-2026"],[9264,"STEVEN HUDSON","2026-07-29","10:25","M","Istanbul to Mardin",1,"2026-08-27","01:40","E","Wings to EIA",1,"2026-06-17","KT","TK 804/317","","","Farhang","Updated 26-07-26"],[9266,"BRETT ANTHONY CHARLES","2026-08-05","19:20","M","Istanbul to Mardin",1,"2026-09-11","01:40","E","Ramada Hotel to EIA",0,"2026-06-21","KT","TK2678/317","","","Zana","Updated 31-07"],[9267,"Miqdad Muslih","2026-07-05","16:15","E","EIA to TBC",1,"2026-06-24","03:15","E","TBC to EIA",1,"2026-06-21","TRF","IA 911 / IA912","","","Zana",""],[9268,"Rebaz Artoshi","2026-07-05","16:15","E","EIA to Ramada Hotel",1,"2026-06-24","03:15","E","TBC to EIA",1,"2026-06-21","TRF","IA 911 / IA912","","","Zana",""],[9269,"MARK ANTHONY WHEELER","2026-08-19","13:15","E","EIA to RC",1,"2026-07-16","17:30","E","RC toEIA to EIA",1,"2026-06-21","KT","G 9357/9358","","","Farhang",""],[9270,"MARK ANTHONY WHEELER","2026-08-11","21:00","E","EIA to RC",1,"2026-08-12","13:55","E","RC to EIA",1,"2026-06-21","KT","QR 450/FZ 210","Cancelled","","Farhang","Cancelled"],[9271,"Nasseer Qarban Ali","2026-07-05","16:15","E","EIA to TBC",1,"2026-06-24","03:15","E","TBC to EIA",1,"2026-06-21","TRF","IA 911 / IA912","","FT","Idrees",""],[9272,"Nihad Yousif","2026-07-05","16:15","E","EIA to Ramada Hotel",1,"2026-06-24","03:15","E","TBC to EIA",1,"2026-06-21","TRF","IA 911 / IA912","","","Idrees",""],[9274,"KAARE WILLEMOES JOERGENSEN","2026-07-07","23:45","E","EIA to Ramada Hotel",1,"2026-08-06","14:00","M","Mardin to EIA",1,"2026-06-22","KT","TK 316 / TK 2677","","","Idrees","Dep updated 30-July"],[9275,"PANIMUTHU SELVENDRA AJITH JESURAJAN","2026-06-24","13:15","E","EIA to TBC",1,"2026-07-23","12:05","E","TBC to EIA",1,"2026-06-22","KT","G 9357/ G 9358","","","Idrees",""],[9276,"Fabrizio Merola","2026-07-05","09:00","E","EIA to Ramada Hotel",1,"2026-08-11","18:30","E","Ramada Hotel to EIA",1,"2026-06-22","KT","TK314/6897","","","Zana",""],[9277,"CYRUS JAVELLANA","2026-06-24","14:00","E","EIA to TBC",1,"2026-07-21","15:00","E","TBC to EIA",1,"2026-06-22","KT","QR2070/2071","","","Zana",""],[9278,"Edward Anton Ajey Joseph De Nixon","2026-06-24","13:15","E","EIA to TBC",1,"2026-07-24","12:05","E","TBC to EIA",1,"2026-06-22","KT","G9357/9358","","","Zana",""],[9284,"MARK SWEENEY","2026-07-23","10:25","M","",1,"2026-08-21","01:40","E","Ramada Hotel to EIA",1,"2026-06-23","KT","TK 2674 / TK 317","","FT","Idrees","updated 20-July"],[9285,"DAVID MICHAEL SMITH","2026-08-13","15:50","E","EIA to RC",1,"2026-07-16","14:30","E","RC to EIA",1,"2026-06-23","KT","FZ203/TK","","FT","Idrees","Dep updated 16-07-2026"],[9286,"VINOTH MANOHARAN","2026-06-24","13:15","E","EIA to TBC",1,"2026-07-16","12:05","E","TBC to EIA",1,"2026-06-23","KT","G 9357/ G 9358","","","Idrees",""],[9287,"Kanaga Sundara Moorthy Servaran","2026-07-07","11:25","E","EIA to TBC",1,"2026-08-03","12:05","E","TBC to EIA",1,"2026-06-23","KT","G 9357/ G 9358","","","Idrees","Dep Updated - 02 AUG"],[9288,"KUMARA SWAMY","","","","",0,"2026-07-09","12:05","E","TBC to EIA",1,"2026-06-23","KT","/ G 9358","","","Idrees",""],[9347,"CRAIG JOSEPH KELLY","2026-07-16","11:25","E","EIA to Wing",1,"2026-07-14","12:05","E","Wing to EIA",1,"2026-06-23","KT","G 9357/ G 9358","","FT","Idrees",""],[9348,"CRAIG JOSEPH KELLY","2026-06-07","13:15","E","EIA to Wing",1,"2026-07-16","22:00","E","Wing to EIA",1,"2026-06-23","KT","QR 450/ QR 451","","FT","Idrees",""],[9349,"KEVIN ALBERT MEEHAN","2026-07-16","11:25","E","EIA to Wing",1,"2026-08-19","04:20","E","Wing to EIA",1,"2026-06-23","KT","G 9357 / QR 455","","FT","Idrees",""],[9350,"Sameh Gameel Yousef Hanna","2026-06-29","14:00","E","EIA to Divan Hotel",1,"2026-07-10","15:00","E","Divan Hotel to EIA",1,"2026-06-24","Daniela","FZ 203/204","","","Kamiran","Dep Updated by Jalal"],[9351,"Arul Singh Gregory","","","","",0,"2026-07-06","12:05","E","TBC to EIA",1,"2026-06-24","KT","G9358","","","Kamiran",""],[9352,"Akhilesh Babu Akhilesh Babu","","","","",0,"2026-07-06","12:05","E","TBC to EIA",1,"2026-06-24","KT","G9358","","","Mohammed",""],[9353,"Garreth Ratchford","2026-07-15","20:00","E","EIA to RC",1,"2026-08-21","21:00","E","RC to EIA",1,"2026-06-26","KT","R 820/821","","FT","Kamiran",""],[9354,"Szabolcs Suto","2026-06-28","04:45","E","EIA to TBC",1,"2026-07-23","14:00","M","Mardin to IST",1,"2026-06-26","KT","TK804/317","","","Kamiran",""],[9355,"Eko Setiyo Pratmana","","","","",0,"2026-07-09","15:00","E","TBC to EIA",1,"2026-06-27","KT","EK 2071","","","Kamiran",""],[9356,"Chris Spencer","2026-06-29","09:00","E","EIA to Divan Hotel",1,"2026-07-07","01:40","E","Divan Hotel to EIA",1,"2026-06-28","Dag","TK 314/317","","CIP","Farhang",""],[9357,"TIMOTHY DAVID FEENEY","2026-08-05","10:25","S","",1,"2026-09-03","01:40","E","TBC to EIA",0,"2026-06-28","KT","TK 2666/317","","","Kamiran","Arri Updated 02-Aug"],[9358,"KANNAN SHANMUGAIH","","","","",0,"2026-07-09","12:05","E","TBC to EIA",1,"2026-06-28","KT","G 9357/ G 9358","","","Kamiran",""],[9359,"Udhayakumar Alagarsamy","2026-07-07","11:25","E","EIA to TBC",1,"2026-07-30","12:05","E","TBC to EIA",1,"2026-06-28","KT","G 9357/ G 9358","","","Kamiran",""],[9360,"ALDRIN PIUS VISWASAM","2026-07-02","11:25","E","EIA to TBC",1,"2026-08-02","13:55","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang",""],[9361,"RAMESH RANJIT GEORGE","2026-07-02","11:25","E","EIA to TBC",1,"2026-08-02","13:55","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Omid",""],[9362,"George Edwin Prabhu John Flose","2026-07-01","13:15","E","EIA to TBC",1,"2026-08-14","12:05","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang","DEP Updated - 7 July"],[9363,"George Sunil Jesumani Muthu","2026-07-01","13:15","E","EIA to TBC",1,"2026-07-31","12:05","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang",""],[9364,"Jagdish Raghunath Patil","2026-07-04","11:25","E","EIA to TBC",1,"2026-08-07","12:05","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang","Arrival updated 30-06-2026"],[9365,"JERIN XAVIER JISCARD JOSEPH LAWRENCE","2026-07-01","13:15","E","EIA to TBC",1,"2026-08-01","12:05","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang",""],[9366,"KUMARAN SUDHI PARIPPIL PARAMBIL","2026-07-02","11:25","E","EIA to TBC",1,"2026-08-02","13:55","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang",""],[9367,"LAWRENCE DAVID HUGHES","2026-07-02","21:00","E","EIA to Ramada Hotel",1,"2026-07-30","15:00","E","TBC to EIA",1,"2026-06-29","KT","QR 450/ FZ 204","","","Farhang","DP Updated - 26 - July"],[9368,"MARIAMAHIZHAN AMALADASNADAR","2026-07-01","13:15","E","EIA to TBC",1,"2026-08-05","13:55","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang","DP Updated - 31-July"],[9369,"Philixroyan Philip Siluvai Micheal","2026-07-01","13:15","E","EIA to TBC",1,"2026-08-01","12:05","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang",""],[9370,"Raja Jenifer Asir Raja Kumar","2026-07-01","13:15","E","EIA to TBC",1,"2026-07-25","12:05","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang","Dep updated 23-07-2026"],[9371,"DESTACAMENTO, RAMIL","2026-07-02","21:00","E","EIA to Ramada Hotel",1,"2026-07-14","22:00","E","TBC to EIA",1,"2026-06-29","KT","QR 450/451","","","Farhang","Arrival updated 01-07-26"],[9372,"SAHAYA LENIN ANNA DHASON","2026-07-02","11:25","E","EIA to TBC",1,"2026-08-02","13:25","E","TBC to EIA",1,"2026-06-29","KT","G 9357/ G 9358","","","Farhang",""],[9373,"SCOTT MACKAY","2026-07-01","04:45","E","EIA to Ramada Hotel",1,"2026-07-29","20:05","M","Mardin to Istanbul",1,"2026-06-29","KT","TK 804/ TK 2679","","","Farhang","DP Updated - 23 - July"],[9374,"SYED YASIR HASSAN RIZVI","2026-07-01","13:15","E","EIA to TBC",1,"2026-07-09","12:05","E","TBC to EIA",1,"2026-06-29","KT","G 9357/9358","","","Farhang",""],[9375,"PHILLIPPUS PETRUS ROOS","2026-08-13","15:50","E","EIA to Ramada Hotel",1,"2026-08-31","16:50","E","TBC to EIA",1,"2026-06-29","KT","QR 2070/2071","","","Farhang","Arri Updated 02-Aug"],[9377,"JOSE MATHAN SINGH SANJEVEE","2026-07-01","13:15","E","EIA to TBC",1,"2026-08-01","12:05","E","TBC to EIA",1,"1900-01-29","KT","G 9357/9358","","","Farhang",""],[9378,"Suthan Chelladurai","2026-07-01","13:15","E","EIA to TBC",1,"2026-08-05","13:55","E","TBC to EIA",1,"1900-01-29","KT","G 9357/9358","","","Farhang","DP Updated - 31 July"],[9379,"HELLEN KOMBE","2026-07-02","23:45","E","EIA to Divan Hotel",1,"2026-07-06","01:40","E","Divan Hotel to EIA",1,"2026-06-30","CM","TK 316/317","","CIP","Farhang","Chris senser's wife"],[9380,"CRAIG JOSEPH KELLY","2026-08-18","21:00","E","EIA to TBC",1,"2026-09-22","22:00","E","TBC to EIA",0,"2026-06-30","KT","QR 450/451","","","Farhang",""],[9381,"Lee John Silverlock","2026-07-10","11:25","E","EIA to TBC",1,"2026-07-15","13:55","E","TBC to EIA",1,"2026-06-30","TRF","G 9357/9358","","FT","Farhang","Updated - 07 July"],[9382,"Dag Andre Moen","2026-09-02","15:50","E","EIA to RC",0,"2026-07-29","15:00","E","RC to EIA",1,"2026-07-01","KT","FZ203/204","","CIP","Zana",""],[9383,"ALBERT KENNADY ASIRVATHAM","2026-07-04","11:25","E","EIA to TBC",1,"2026-08-12","13:55","E","TBC to EIA",1,"2026-07-01","KT","G 9357/9358","","","Farhang",""],[9384,"Daniela Marin Dumitra","2026-07-02","11:25","E","EIA to TBC",1,"2026-07-02","15:00","E","TBC to EIA",1,"2026-07-01","Daniela","G 9357/FZ 204","","CIP","Farhang",""],[9385,"James Aaron Foster","2026-07-02","11:15","E","EIA to TWK",1,"2026-07-03","15:00","E","TBC to EIA",1,"2026-07-01","Daniela","G9357/FZ204","","CIP","Zana",""],[9386,"BARRY RUSSELL","2026-07-03","04:45","E","EIA to Ramada Hotel",1,"2026-08-01","11:10","M","Mardin to Istanbul",1,"2026-06-07","KT","TK 804 / TK 315","","","Idrees","Updated 26-07-26"],[9387,"PATRICK JOHN OCALLAGHAN","2026-07-15","23:45","E","EIA to RC",1,"2026-08-13","16:50","E","TBC to EIA",1,"2026-07-02","KT","TK316/FZ204","","","Zana","Updated 10/08"],[9388,"Paul Francis Gibbon","2026-07-04","04:45","E","EIA to TWK",1,"2026-07-21","20:05","M","Mardin to IST",1,"2026-07-02","KT","TK804/317","","","Zana",""],[9389,"HOSSEIN SAFAEI MOHAMADABADI","2026-07-06","04:45","E","EIA to Divan Hotel",1,"2026-07-09","09:55","E","Divan Hotel to EIA",1,"2026-07-03","Hossein","TK 804 / TK 315","","CIP","Idrees",""],[9390,"SHAHZAD YASIN","2026-07-04","15:50","E","EIA to Ramada Hotel",1,"","","","",0,"","","","","","",""],[9391,"Peter Ashley Gregory Mills","2026-07-11","23:45","E","",1,"2026-08-05","20:05","M","Mardin - IST to EIA",1,"2026-07-05","KT","TK316/1967","","","Mohammed","DEP Updated"],[9392,"Colin John Linklater","2026-07-06","11:25","E","",1,"2026-07-14","12:05","E","TBC to EIA",1,"2026-07-05","TRF","G 9357","","CIP","Mohammed",""],[9393,"Dmitry Vilkov","2026-07-10","11:25","E","EIA to TBC",1,"2026-07-15","13:55","E","TBC to EIA",1,"2026-07-05","TRF","G 9357/ G 9358","","","Mohammed","Updated - 07 July"],[9394,"DINESH PURI","2026-07-10","13:15","E","",1,"2026-07-15","12:05","E","TBC to EIA",1,"2026-07-05","TRF","G 9357/ G 9358","","","Mohammed",""],[9395,"ADIL PASHA","2026-07-10","13:15","E","",1,"2026-07-15","12:05","E","TBC to EIA",1,"2026-07-05","TRF","G 9357/ G 9358","","","Mohammed",""],[9396,"SELVAKUMAR CHINNADURAI","2026-07-28","11:25","E","EIA to TBC",1,"2026-08-27","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9397,"VIVEK KOTHECHIRA SATHYAN","2026-07-20","11:25","E","EIA to TBC",1,"2026-08-14","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","Cancelled","","Idrees","Cancelled 19-7-2026"],[9398,"Arockia Vinoth","2026-07-16","11:25","E","EIA to TBC",1,"2026-08-22","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9399,"SAHAYA RENO MARIA VARGHESE KENNADY","2026-07-16","11:25","E","EIA to TBC",1,"2026-08-22","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9400,"Pattuthurai Perumal Nadar","2026-07-07","11:25","E","EIA to TBC",1,"2026-08-13","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9401,"MARTIN ISSOTT","2026-07-30","11:25","E","EIA to TBC",1,"2026-08-28","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9402,"KUMAR DILLIBABU","2026-07-18","11:25","E","EIA to TBC",1,"2026-08-15","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9403,"KOSAL RAMAN NATARAJAN","2026-07-21","11:25","E","EIA to TBC",1,"2026-09-03","12:05","E","TBC to EIA",0,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9404,"Ganapathi Somasundaram","2026-07-07","11:25","E","EIA to TBC",1,"2026-08-06","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9405,"Gandhi Rajagopal","2026-07-08","13:15","E","EIA to TBC",1,"2026-08-07","12:05","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees",""],[9406,"DON GODSON IRUTHAYARAJ","2026-07-19","13:15","E","EIA to TBC",1,"2026-08-16","13:55","E","TBC to EIA",1,"2026-07-05","KT","G 9357/ G 9358","","","Idrees","Departure updated 03-08-26"],[9407,"NUANGKUNTHA/DIREK","2026-07-13","14:00","E","EIA to TBC",1,"2026-08-15","16:50","E","TBC to EIA",1,"2026-07-05","KT","FZ 203 / FZ 204","","","Idrees",""],[9408,"Dwi Muhadi","2026-07-23","14:00","E","EIA to TBC",1,"2026-08-13","16:50","E","TBC to EIA",1,"2026-07-05","KT","FZ 203 / FZ 204","","","Idrees","Dep updated 14-07-2026"],[9409,"Ariel Jungco","2026-08-12","03:15","E","EIA to TBC",1,"2026-09-08","22:00","E","TBC to EIA",0,"2026-07-05","KT","QR 454/ QR 451","","","Idrees",""],[9411,"JAMIE ANTHONY O SULLIVAN","2026-07-10","04:45","E","EIA to TBC",1,"2026-08-01","09:55","E","TBC to EIA",1,"2026-07-05","KT","TK 804 / TK 315","","","Idrees",""],[9412,"PRATASTIO AGUNG CAHYO HARTANTO","2026-07-09","09:00","E","EIA to TBC",1,"2026-08-06","09:55","E","TBC to EIA",1,"2026-07-05","KT","TK 314 / TK 315","","","Idrees",""],[9413,"RUDYANSYAH ARSYAD","2026-07-30","14:00","E","EIA to TBC",1,"2026-08-27","16:50","E","TBC to EIA",1,"2026-07-05","KT","FZ 203 / FZ 204","","","Idrees",""],[9414,"YOUCEF RIABI","2026-07-09","09:00","E","EIA to TBC",1,"2026-08-08","18:20","E","TBC to EIA",1,"2026-07-05","KT","TK 314 / RJ 821","","","Idrees","Dep updated 08-08-2026"],[9415,"SHAHZAD YASIN","2026-07-04","15:50","E","",1,"2026-07-26","15:00","E","TBC to EIA",1,"2026-07-05","KT","FZ 203 / FZ 204","","","Mohammed","Updated 25/07"],[9416,"Colin John Linklater","2026-07-06","11:25","E","",1,"","","","",0,"2026-07-05","TRF","G 9357","","","Mohammed","duplicated"],[9417,"Sean Parker","2026-07-22","10:25","M","IST to Mardin",1,"2026-08-19","19:55","E","TBC to EIA",1,"2026-07-06","KT","TK804/317","","","Kamiran","Updated 14/8"],[9418,"Abigail Marie Giljum","2026-07-06","11:25","E","EIA to Field",1,"2026-07-09","12:05","E","Divan Hotel to EIA",1,"2026-07-05","MRF","G 9357-9358","","CIP","Kamiran",""],[9419,"John Wayne Egelston","2026-07-16","14:00","E","EIA to Divan Hotel",1,"2026-07-22","15:00","E","Divan Hotel to EIA",1,"2026-07-06","TRF","FZ 203 / FZ 204","Cancelled","CIP","Mohammed","Cancelled by TRF 14-07-2026"],[9420,"Akhilesh Babu","2026-07-27","11:25","E","EIA to TBC",1,"2026-08-23","13:55","E","TBC to EIA",1,"2026-07-07","KT","G 9357-9358","","","Kamiran","updated 16-07"],[9421,"Charles Van Niekerk","2026-07-22","03:15","E","EIA to Ramada Hotel",1,"2026-08-20","14:40","E","Ramada Hotel to EIA",1,"2026-07-07","KT","QR 454 / 451","","","Kamiran","Dep time updated - 13-08"],[9422,"DAVID JHON HILL","2026-08-20","09:00","E","EIA to TBC",1,"2026-07-24","08:25","E","Ramada Hotel to EIA",1,"2026-07-07","KT","TK 317/314","","","Kamiran",""],[9423,"JOHANNES CORNELIUS ROOS","2026-07-09","14:00","E","EIA to TBC",1,"2026-08-02","16:50","E","TBC to EIA",1,"2026-07-07","KT","EK2070/2071","","","Kamiran",""],[9424,"Dale C. Fraser","2026-07-15","14:00","E","EIA to TBC",1,"2026-08-27","16:50","E","TBC to EIA",1,"2026-07-07","KT","EK2070/2071","","","Kamiran",""],[9425,"CRAIG JOSEPH KELLY","2026-07-16","11:25","E","EIA to Wing",1,"2026-07-14","12:05","E","Wing to EIA",1,"2026-07-08","KT","G 9358/9357","","","Kamiran","duplicated"],[9426,"Suresh Shanmugam","2026-07-26","13:15","E","EIA to TBC",1,"2026-08-23","13:55","E","TBC to EIA",1,"2026-07-08","KT","G 9357/9358","","","Kamiran",""],[9427,"ERKAN TUMKAYA","2026-07-10","04:45","E","EIA to TBC",1,"2026-08-06","09:55","E","TBC to EIA",1,"2026-07-09","KT","TK 804 / TK 315","","","Kamiran",""],[9428,"Massimo Quarchioni","2026-07-20","13:15","M","",1,"2026-08-15","14:30","E","W5 to EIA",1,"2026-07-09","KT","TK 316 / TK 6895","","FT","Kamiran","Arr updated 14-08-2026"],[9429,"Nabaz Rahim","2026-07-28","03:05","E","EIA to Home",1,"2026-07-15","07:45","E","Home to EIA",1,"2026-07-11","Nabaz","RJ 824/827","","","Farhang","With family"],[9430,"Darren Walter Wolfram","2026-07-19","21:00","E","EIA to Ramada Hotel",1,"2026-08-20","22:00","E","TBC to EIA",1,"2026-07-12","KT","QR 450/451","","","Farhang",""],[9431,"SZABOLCS SUTO","2026-08-18","18:00","E","EIA to Ramada Hotel",1,"2026-09-16","01:40","E","Ramada Hotel to EIA",0,"2026-07-13","KT","TK 316/317","","","Farhang","Arri time Updated 13-Aug"],[9432,"Nigel Robert Nichol","2026-08-01","10:25","M","Istanbul to Mardin",1,"2026-08-29","01:40","E","Ramada Hotel to EIA",1,"2026-07-13","KT","TK 2674/317","","","Farhang","update 23-07-26"],[9433,"ALFAOUR, MUAYAD","2026-07-15","20:00","E","EIA to TBC",1,"2026-07-25","01:40","E","TBC to EIA",1,"2026-07-13","Baraa","RJ 820/TK 316","","FT","Farhang","TRF not approve yet"],[9434,"Lavan Shakir Kamal","","","","",0,"2026-07-16","15:00","E","TBC to EIA",1,"2026-07-15","TRF","/ FZ 204","","FT","Idrees","Dep updated 16-07-2026"],[9435,"PIERRE YVES MARCEL JEAN DESQUET","2026-08-10","15:50","E","EIA to Ramada Hotel",1,"2026-09-16","16:50","E","TBC to EIA",0,"2026-07-16","KT","FZ 203 / FZ 204","","","Idrees",""],[9436,"Richard Sutherland","2026-07-29","10:25","M","Istanbul to Mardin",1,"2026-08-26","05:40","E","Ramada Hotel to EIA",1,"2026-07-16","KT","TK 2674 / TK 805","","","Idrees","Arrival update 24-07-26"],[9437,"Kingsley Ikenna Uzowulu","2026-07-19","16:30","E","EIA to Ramada Hotel",1,"2026-07-24","15:00","E","TBC to EIA",1,"2026-07-16","TRF","FZ 209 / FZ 204","Cancelled","FT","Idrees","Cancelled"],[9438,"Mathan Thangathurai","2026-07-22","13:15","E","EIA to TBC",1,"2026-08-21","12:05","E","TBC to EIA",1,"2026-07-19","TRF","G 9357/9358","","","Kamiran",""],[9439,"Dilzhan Nori Abdulrahman Abdulrahman","2026-07-24","16:30","E","EIA to TBC",1,"","","","",0,"2026-07-22","TRF","FZ 209","","","Farhang","No need transportation"],[9440,"Derek wesley Dosreis","2026-08-26","04:45","E","EIA to W7-1D",1,"2026-09-24","01:40","E","W7-1D to EIA",0,"2026-07-22","KT","TK 804/317","","","Farhang",""],[9441,"Grant Jamie Desmond","2026-07-29","14:00","E","EIA to Ramada Hotel",1,"2026-08-25","16:50","E","TBC to EIA",1,"2026-07-23","KT","FZ 203 / FZ 204","","FT","Farhang","NJ"],[9442,"Joseph Hector Macinnis","2026-08-05","19:20","M","",1,"2026-09-02","04:20","E","",0,"2026-07-25","KT","QR450/455","","","Zana",""],[9443,"KANNAN SHANMUGAIH","2026-07-28","11:25","E","EIA to Team",1,"2026-08-27","12:05","E","Team to EIA",1,"2026-07-26","KT","G 9357/9358","","","Farhang",""],[9444,"GODWYN RUBESH ANTONY GEORGE","2026-07-31","11:25","E","EIA to TBC",1,"2026-08-27","12:05","E","TBC to EIA",1,"2026-07-27","KT","G 9357 / G 9358","","","Idrees",""],[9445,"Mukesh Balachandran","2026-07-29","13:15","E","EIA to TBC",1,"2026-08-28","12:05","E","TBC to EIA",1,"2026-07-27","KT","G 9357 / G 9358","","","Idrees",""],[9446,"Sahaya Antony Robert George Savarimuthu Reethiah","2026-07-31","11:25","E","EIA to TBC",1,"2026-08-27","12:05","E","TBC to EIA",1,"2026-07-27","KT","G 9357 / G 9358","","","Idrees",""],[9447,"Raja Jeevan Rajakumar","2026-07-31","11:25","E","EIA to TBC",1,"2026-08-22","12:05","E","TBC to EIA",1,"2026-07-27","KT","G 9357 / G 9358","","","Idrees",""],[9448,"Sreenivas Medisetti","2026-07-30","11:25","E","EIA to TBC",1,"2026-08-27","12:05","E","TBC to EIA",1,"2026-07-27","KT","G 9357 / G 9358","","","Idrees",""],[9449,"Mariajoris Kathir Thiraviam","2026-07-31","11:25","E","EIA to TBC",1,"2026-08-27","12:05","E","TBC to EIA",1,"2026-07-27","KT","G 9357 / G 9358","","","Idrees",""],[9450,"Lathis Rex Anand Francis","2026-07-31","11:25","E","EIA to TBC",1,"2026-08-27","12:05","E","TBC to EIA",1,"2026-07-27","KT","G 9357 / G 9358","","","Idrees",""],[9451,"Hariharan Suyambu","2026-07-31","11:25","E","EIA to TBC",1,"2026-08-27","12:05","E","TBC to EIA",1,"2026-07-27","KT","G 9357 / G 9358","","","Idrees",""],[9452,"KEVIN PEARCE","2026-08-04","21:00","E","EIA to Ramada Hotel",1,"2026-09-03","22:00","E","TBC to EIA",0,"2026-07-28","KT","QR 450 / QR 451","","","Idrees",""],[9453,"Alessandra Vecchio","2026-07-29","16:30","E","EIA to Ramada Hotel",1,"2026-08-05","16:50","E","Ramada Hotel to EIA",1,"2026-07-28","TRF","FZ 209 / FZ 204","Cancelled","","Idrees","Cancelled 29-7-2026"],[9454,"DAVIDE OTTOLIA","2026-08-12","10:35","E","EIA to Wing",1,"2026-09-09","09:55","E","TBC to EIA",0,"2026-07-29","KT","TK / TK 315","","FT","Idrees",""],[9455,"DALE COLIN FRASER","2026-08-08","11:25","E","EIA to TBC",1,"2026-08-02","13:55","E","TBC to EIA",1,"2026-07-29","TRF","G 9357 / G 9358","","","Idrees",""],[9456,"Kevin Meehan","2026-10-27","22:00","E","EIA to TBC",0,"2026-09-22","21:00","E","TBC to EIA",0,"2026-07-30","KT","QR 450/451","","","Kamiran",""],[9457,"Jamie Anthony O Sullivan","2026-08-27","11:25","E","",1,"2026-09-25","16:50","E","",0,"2026-07-31","KT","FZ 203 / FZ 204","","","Mohammed",""],[9458,"Vikas Janu Tambe","2026-08-05","13:15","E","",1,"2026-09-11","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9459,"Cyrus B. Javellana","2026-08-18","21:00","E","EIA to Ramada Hotel",1,"2026-09-17","22:00","E","",0,"2026-07-31","KT","QR 450 / QR 451","","","Mohammed",""],[9460,"Ramil Destacamento","2026-08-12","03:15","E","EIA to Ramada Hotel",1,"2026-09-13","22:00","E","",0,"2026-07-31","KT","QR 454 / QR 451","","","Mohammed",""],[9461,"Pravin Dattaram Karanjavkar","2026-08-14","11:25","E","EIA to TBC",1,"2026-09-11","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9463,"Jeganathan Selva Sivalingam","2026-08-20","11:25","E","",1,"2026-09-26","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9464,"Michael Akash Michael Jerold Simon","2026-08-20","11:25","E","",1,"2026-09-26","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9465,"Panimuthu Selvendra Ajith","2026-08-12","13:15","E","EIA to TBC",1,"2026-09-17","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9466,"David Paul Fowler","2026-08-12","13:15","E","EIA to TBC",1,"2026-09-10","01:40","E","Ramada Hotel to EIA",0,"2026-07-31","KT","G 9357 / TK317","","","Mohammed",""],[9467,"George Sunil Jesumani Muthu","2026-08-26","13:15","E","",1,"2026-09-25","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9468,"Edward Anton Ajey Joseph De Nixon","2026-08-19","13:15","E","",1,"2026-09-18","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9469,"Mukesh Balachandran","2026-07-29","13:15","E","",1,"2026-08-28","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9471,"Don Godson Iruthayaraj","2026-09-03","11:25","E","EIA to TBC",0,"2026-09-25","12:05","E","TBC to EIA",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed","Updated 03-08-26"],[9472,"Beemachandran Thangavel","2026-08-11","11:25","E","EIA to TBC",1,"2026-09-17","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9473,"Vinoth Manoharan","2026-08-11","11:25","E","EIA to TBC",1,"2026-09-10","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9474,"KUMARA SWAMY","2026-08-07","11:25","E","EIA to TBC",1,"2026-09-10","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","Cancelled","","Mohammed","Updated 31-07 / Arrive Cancelled"],[9475,"Kannan Shanmugaih","2026-07-28","11:25","E","",1,"2026-08-27","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9476,"Udhayakumar Alagarsamy","2026-08-25","11:25","E","",1,"2026-09-24","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9477,"Scott Mackay","2026-08-25","11:00","E","EIA to Ramada Hotel",1,"2026-09-24","12:05","E","Ramada Hotel to EIA",0,"2026-07-31","KT","G9357/9358","","","Mohammed","Updated - 14-August"],[9478,"Joseph Clains Sekaran","2026-09-01","11:25","E","",1,"2026-09-24","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9479,"Aldrin Pius Viswasam","2026-08-25","11:25","E","",1,"2026-09-17","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9480,"Jerin Xavier Jiscard","2026-08-25","11:10","E","",1,"2026-09-24","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed","Updated 02 AUG"],[9481,"Ramesh Ranjit George","2026-08-25","11:10","E","",1,"2026-09-17","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed","Updated 02 AUG"],[9482,"Sahaya Lenin Anna Dhason","2026-08-25","11:25","E","",1,"2026-09-24","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9483,"Mariamahizhan Amaladasadar","2026-08-25","11:25","E","",1,"2026-09-24","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9484,"Suthan Chelladurai","2026-08-25","11:25","E","",1,"2026-09-24","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9485,"Philixroyan Philip Siluvai Michael","2026-08-20","11:25","E","",1,"2026-09-10","12:05","E","",0,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9486,"Mariajoris Kathir Thiraviam","2026-07-31","11:25","E","",1,"2026-08-27","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9487,"Hariharan Suyambu","2026-07-31","11:25","E","",1,"2026-08-27","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9488,"Rajajeevan Rajakumar","2026-07-30","11:25","E","",1,"2026-08-22","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9489,"Sreenivas Medisetti","2026-07-30","11:25","E","",1,"2026-08-27","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9490,"Lathis Rex Anand","2026-07-30","11:25","E","",1,"2026-08-27","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9491,"Godwyn Rubesh Antony George","2026-07-30","11:25","E","",1,"2026-08-27","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9492,"Sahaya Antony Robert","2026-07-30","11:25","E","",1,"2026-08-27","12:05","E","",1,"2026-07-31","KT","G 9357 / G 9358","","","Mohammed",""],[9493,"Lawrence Hughes","2026-08-27","15:50","E","EIA to Ramada Hotel",1,"2026-09-24","16:50","E","TBC to EIA",0,"2026-08-02","KT","EK 2070/2071","","","Kamiran",""],[9494,"Richard Cameron Carnegie","2026-08-20","06:50","E","EIA to TBC",1,"2026-09-17","07:45","E","Ramada Hotel to EIA",0,"2026-08-02","KT","R826-827","","","Kamiran",""],[9495,"Rakesh Kumar","2026-09-10","11:25","E","EIA to TBC",0,"2026-10-15","12:05","E","TBC to EIA",0,"2026-08-02","KT","G 9357 / G 9358","","","Kamiran",""],[9496,"Kurtis Edwin Maser","2026-08-05","19:20","M","",1,"2026-09-04","20:05","M","",0,"2026-08-02","Kurtis","TK2678-TK2679","","","Mohammed",""],[9497,"FRANS ANTOINE HERMANS","2026-08-05","06:55","E","EIA to TBC",1,"2026-09-03","16:50","E","TBC to EIA",0,"2026-08-03","KT","Flydubai 209/204","","","Omid",""],[9498,"MARK SWEENEY","2026-09-17","09:00","E","",0,"2026-10-16","01:40","E","Ramada Hotel to EIA",0,"2026-08-03","KT","TK314/317","","","Zana",""],[9499,"Graeme Nixon","2026-08-19","13:10","E","EIA to RC",1,"2026-09-17","22:00","E","RC to EIA",0,"2026-08-03","KT","QR454/BA6198","","","Zana","Arri time updated - 13 AUG"],[9500,"Mark Geddes","2026-08-05","06:55","E","EIA to Ramada Hotel",1,"","","","",0,"2026-08-04","TRF","EK 2396","","FT","Farhang",""],[9501,"CORNELIS ANTONIUS SIECKER","2026-08-05","15:50","E","EIA to Ramada Hotel",1,"","","","",0,"2026-08-04","TRF","EK 270","","FT","Farhang",""],[9502,"AHMAD HILMI BIN MOHAMED","2026-08-05","15:50","E","EIA to Ramada Hotel",1,"","","","",0,"2026-08-04","TRF","EK 270","","FT","Farhang",""],[9503,"DODDS, CHRISTOPHER","2026-09-14","03:05","E","EIA to Ramada Hotel",0,"2026-10-13","04:20","E","Ramada Hotel to EIA",0,"2026-08-04","KT","RJ 824/825","","FT","Farhang","NJ"],[9504,"EKO SETIYO PRATMANA","2026-08-06","12:25","E","",1,"2026-09-03","16:50","E","",0,"2026-08-04","KT","E 2396/2071","","","Farhang",""],[9505,"ARUL SINGH GREGORY","2026-08-10","11:25","E","EIA to TBC",1,"2026-09-17","12:05","E","TBC to EIA",0,"2026-08-04","KT","G 9357 / G 9358","","","Farhang",""],[9506,"MARKUS RAINER","2026-08-14","04:45","E","EIA to TBC",1,"2026-09-12","12:00","E","Ramada Hotel to EIA",0,"2026-08-04","KT","TK 804/317","","","Farhang","Arrival Time update 12-08-26"],[9507,"Muhammad Tariq Siddiqui","2026-08-15","11:25","E","EIA to TBC",1,"2026-09-12","12:05","E","TBC to EIA",0,"2026-08-05","KT","G 9357/9358","","","Farhang",""],[9508,"Dmitriy USOLTSEV","2026-08-19","18:00","E","EIA to TBC",1,"2026-09-17","09:55","E","TBC to EIA",0,"2026-08-05","KT","TK 316/315","","","Farhang","Arri time updated - 13 AUG"],[9509,"Macinnis joseph hector","2026-09-30","23:45","E","EIA to Ramada Hotel",0,"2026-09-03","09:55","E","Ramada Hotel to EIA",0,"2026-08-06","KT","TK316/315","","","Zana",""],[9510,"Nicolas Michael Holland","2026-08-18","09:00","E","EIA to Ramada Hotel",1,"2026-09-16","09:55","E","Ramada Hotel to EIA",0,"2026-08-06","KT","TK34/315","","FT","Zana","NJ FT - Arri time updated - 13 AUG"],[9511,"STEPHEN ADETUNJI ADERELE","2026-08-24","23:45","E","EIA to Ramada Hotel",1,"2026-09-23","09:55","E","Ramada Hotel to EIA",0,"2026-08-06","KT","316/315","","FT","Zana","NJ FT/X DNO"],[9512,"Baraa Hekma","2026-09-13","23:45","E","EIA to Home",0,"2026-08-14","14:30","E","Home to EIA",1,"2026-08-09","TRF","TK 316 / TK 6895","","FT","Idrees","updated"],[9513,"STEVEN HUDSON","2026-09-22","23:45","E","EIA to TBC",0,"2026-10-22","01:40","E","Wings to EIA",0,"2026-08-10","KT","TK 316 / TK 317","","FT","Idrees",""],[9514,"Graham Boisvenue","2026-08-11","15:50","E","EIA to Ramada Hotel",1,"2026-08-14","16:50","E","Ramada Hotel to EIA",1,"2026-08-10","TRF","FZ 203 / FZ 204","","FT","Idrees",""],[9515,"Maksim Osetrov","2026-08-11","12:15","E","EIA to Field",1,"","","","",0,"2026-08-10","Movcon","FZ 209 /","","","Idrees","No TRF yet"],[9516,"Oleg Osetrov","2026-08-11","12:15","E","EIA to Field",1,"","","","",0,"2026-08-10","Movcon","FZ 209 /","","","Idrees","No TRF yet"],[9517,"VIVEK KOTHECHIRA SATHYAN","2026-08-28","11:25","E","EIA to Field",1,"2026-09-24","12:05","E","EIA to Field",0,"2026-08-10","KT","G9357/9358","","","Zana",""],[9518,"John Wayne Egelston","2026-08-12","15:50","E","EIA to Ramada Hotel",1,"2026-08-20","16:50","E","Ramada Hotel to EIA",1,"2026-08-11","TRF","FZ 203 / FZ 204","","CIP","Mohammed","Dep Updated - 14-8-2026"],[9519,"MCLEAN, DARREN JAMES","2026-09-18","03:15","E","",0,"2026-10-14","04:20","E","",0,"2026-08-11","KT","QR 454/455","","","Mohammed",""],[9520,"Peter Mills","2026-09-01","23:45","E","EIA to TBC",1,"2026-10-01","01:40","E","TBC to EIA",0,"2026-08-11","KT","TK 316 / TK 317","","","Kamiran",""],[9521,"Andrew Sami","2026-10-06","21:00","E","EIA to RC",0,"2026-10-03","22:00","E","RC to EIA",0,"2026-08-12","KT","QR451/ 450","","","Kamiran",""],[9522,"Garreth Ratchford","2026-10-07","20:00","E","EIA to RC",0,"2026-11-27","04:00","E","RC to EIA",0,"2026-08-12","KT","R820/825","","FT","Kamiran",""],[9523,"Chris Spencer","2026-08-17","03:05","E","EIA to TBC",1,"2026-08-18","19:55","E","TBC to EIA",1,"2026-08-13","Andy","RJ 824/TK317","","CIP","Kamiran",""],[9524,"Simon Lange","2026-08-16","18:00","E","EIA to TBC",1,"2026-08-18","19:55","E","TBC to EIA",1,"2026-08-13","Bilal","TK316","","CIP","Kamiran",""],[9525,"Scott Mackay","2026-10-28","05:15","E","EIA to TBC",0,"2026-12-03","02:55","E","TBC to EIA",0,"2026-08-14","KT","TK804/317","","","Kamiran",""]];

function masterSheetRecords() {
  return MASTER_ROWS.map((r) => ({
    ...BLANK,
    id: "ms" + r[0],
    no: r[0],
    name: r[1],
    arrDate: r[2], arrTime: r[3], arrAirport: AP_CODE[r[4]] ?? r[4], arrDest: r[5], arrDone: !!r[6],
    depDate: r[7], depTime: r[8], depAirport: AP_CODE[r[9]] ?? r[9], depDest: r[10], depDone: !!r[11],
    emailDate: r[12], receivedFrom: r[13],
    ...(() => {
      const sp = splitFlights(r[14], !!r[2], !!r[7]);
      const st = r[15] || "On schedule";
      return {
        arrFlight: sp.arr, depFlight: sp.dep,
        arrStatus: r[2] ? st : "On schedule",
        depStatus: r[7] ? st : "On schedule",
      };
    })(),
    service: r[16], regBy: r[17], remarks: r[18],
  }));
}
const MASTER_COUNT = MASTER_ROWS.length;

/* ------------------------------------------------------------------ */
/*  Asking Claude                                                      */
/*  A published page reaches Claude through the host's sample          */
/*  capability, never by calling api.anthropic.com itself: a browser   */
/*  request carries no API key, and putting one in the page would      */
/*  hand it to every user who opens the page.                          */
/*  Resolves to null wherever the capability is not granted, so every  */
/*  caller has to handle its absence.                                  */
/* ------------------------------------------------------------------ */
let samplePromise = null;
function getSample() {
  if (!samplePromise) {
    const host = typeof window !== "undefined" ? window.claude : null;
    samplePromise = host && typeof host.use === "function"
      ? Promise.resolve(host.use("sample")).catch(() => null)
      : Promise.resolve(null);
  }
  return samplePromise;
}

/* The host reports failures as a code; say something useful for each. */
function sampleError(e) {
  switch (e && e.code) {
    case "cancelled":    return "";
    case "not_granted":  return "This page is not allowed to ask Claude. Enter the details by hand.";
    case "rate_limited": return "Too many requests just now — wait a moment and try again.";
    default:             return (e && e.message) || "That did not work — please try again.";
  }
}

/* ------------------------------------------------------------------ */
/*  Live flight status                                                 */
/*  NOT CONNECTED. Checking a flight means reading Flightradar24 or    */
/*  eia.krd, and neither this page nor the sample capability can       */
/*  browse the web. The previous code posted to api.anthropic.com with */
/*  no key, no anthropic-version header and no browser-access header,  */
/*  so it could only ever have failed.                                 */
/*  Answering from the model's own memory instead would mean inventing */
/*  flight times, which is worse than saying nothing. Connecting this  */
/*  for real needs a small server-side lookup holding the API key and  */
/*  running the web search tool — see docs/FLIGHT-LOOKUP.md.           */
/* ------------------------------------------------------------------ */

/* Split one written flight reference into its separate legs.
   "TK316/805" -> TK316 in, TK 805 out.  "G 9357 / G 9358" -> one each way.
   A bare second number inherits the airline code from the first. */
function flightNumbers(raw) {
  const parts = String(raw || "").split(/[\/|,;+&]+/).map((t) => t.trim().replace(/\s+/g, " ")).filter(Boolean);
  if (!parts.length) return [];
  /* the airline code may be written as TK316, G9 357, "E 2396" or even "Flydubai 209",
     and it may only appear on one of the two legs */
  let code = "";
  for (const t of parts) {
    const m = /^([A-Za-z]{2}|[A-Za-z]\d|\d[A-Za-z])\s*\d/.exec(t) || /^([A-Za-z]+)\s+\d/.exec(t);
    if (m) { code = m[1].toUpperCase(); break; }
  }
  return parts.map((t) => (/^\d+$/.test(t) && code ? `${code} ${t}` : t).toUpperCase());
}
/* which number belongs to which leg */
function splitFlights(raw, hasArr, hasDep) {
  const ns = flightNumbers(raw);
  if (!ns.length) return { arr: "", dep: "" };
  if (ns.length > 1) return { arr: ns[0], dep: ns[ns.length - 1] };
  if (hasArr && !hasDep) return { arr: ns[0], dep: "" };
  if (hasDep && !hasArr) return { arr: "", dep: ns[0] };
  return { arr: ns[0], dep: "" }; // one number, two legs — don't guess the second
}
const legFlight = (r, kind) => (kind === "ARR" ? r.arrFlight : r.depFlight) || "";

const CHECK_TO_STATUS = {
  Cancelled: "Cancelled", Delayed: "Delayed", Earlier: "Earlier",
  Diverted: "Changed", "On schedule": "On schedule", Landed: "On schedule", Departed: "On schedule",
};

async function lookupFlight() {
  /* The documented result shape, with found:false — the caller already
     renders that as "could not confirm" rather than treating it as a status. */
  return {
    found: false,
    status: "Unknown",
    scheduled: "",
    actual: "",
    deltaMinutes: 0,
    note: "Live flight status is not connected. It needs a server-side lookup that can search the web; until then, check the airline or the airport board and set the time by hand.",
    source: "",
  };
}

/* ------------------------------------------------------------------ */
/*  Re-scanned tickets                                                 */
/*  When a passenger is reissued a ticket, the second scan has to find */
/*  the record the first one created instead of making a duplicate.    */
/*  Nothing is matched silently — the app proposes, a person confirms. */
/* ------------------------------------------------------------------ */

/* names arrive in any order and any case: "Macinnis joseph hector" = "Joseph Hector Macinnis" */
const nameKey = (n) => String(n || "")
  .toLowerCase().replace(/[^a-z\s]/g, " ").split(/\s+/).filter(Boolean).sort().join(" ");
const nameTokens = (n) => new Set(nameKey(n).split(" ").filter((t) => t.length > 2));

const sameFlight = (a, b) =>
  !!a && !!b && String(a).replace(/\s/g, "").toUpperCase() === String(b).replace(/\s/g, "").toUpperCase();

const daysApart = (a, b) => {
  if (!a || !b) return null;
  return Math.abs((new Date(a + "T12:00:00") - new Date(b + "T12:00:00")) / 86400000);
};

/* fields the scanner can fill, in the order they read on screen */
const TICKET_FIELDS = [
  ["arrDate", "Arrival date"], ["arrTime", "Arrival time"], ["arrAirport", "Arrival airport"],
  ["arrFlight", "Inbound flight"],
  ["depDate", "Departure date"], ["depTime", "Departure time"], ["depAirport", "Departure airport"],
  ["depFlight", "Outbound flight"],
];

/* what would change if this ticket were applied to this record */
function ticketChanges(record, fields) {
  return TICKET_FIELDS
    .filter(([k]) => fields[k] && String(fields[k]) !== String(record[k] || ""))
    .map(([k, label]) => ({ key: k, label, from: record[k] || "—", to: fields[k] }));
}

/* a trip that has already been flown cannot be the one a new ticket revises */
function tripClosed(r, today) {
  const legs = [];
  if (r.arrDate) legs.push(r.arrDone || r.arrDate < today);
  if (r.depDate) legs.push(r.depDone || r.depDate < today);
  return legs.length > 0 && legs.every(Boolean);
}

/* Records this ticket might belong to, best first.
   For a frequent traveller the name is the same on every trip, so the ranking
   is decided by the parts of the ticket that did NOT change — the untouched
   leg, the flight number, the times. */
function findTicketMatches(fields, records, today) {
  const key = nameKey(fields.name);
  const toks = nameTokens(fields.name);
  const out = [];

  records.forEach((r) => {
    let score = 0;
    const rKey = nameKey(r.name);
    if (key && rKey === key) score = 100;
    else if (key && rKey) {
      const shared = [...toks].filter((t) => nameTokens(r.name).has(t)).length;
      const size = Math.max(toks.size, nameTokens(r.name).size) || 1;
      if (shared >= 2 || (shared === 1 && size <= 2)) score = 55 + shared * 10;
    }
    if (score === 0) return; // a different passenger — never offered

    const why = [];
    /* anything on the ticket that already agrees with this record is evidence
       that this is the trip being revised */
    if (fields.arrDate && fields.arrDate === r.arrDate) { score += 40; why.push("same arrival date"); }
    if (fields.depDate && fields.depDate === r.depDate) { score += 40; why.push("same departure date"); }
    if (sameFlight(fields.arrFlight, r.arrFlight)) { score += 30; why.push("same inbound flight"); }
    if (sameFlight(fields.depFlight, r.depFlight)) { score += 30; why.push("same outbound flight"); }
    if (fields.arrTime && fields.arrTime === r.arrTime) score += 15;
    if (fields.depTime && fields.depTime === r.depTime) score += 15;

    const gaps = [daysApart(fields.arrDate, r.arrDate), daysApart(fields.depDate, r.depDate)]
      .filter((d) => d !== null && d > 0);
    const nearest = gaps.length ? Math.min(...gaps) : null;
    if (nearest !== null) {
      if (nearest <= 14) { score += 20; why.push(`${Math.round(nearest)} days apart`); }
      else if (nearest <= 45) score += 10;
      else if (nearest > 120) score -= 30; // a different trip entirely
    }

    const closed = tripClosed(r, today);
    if (closed) score = Math.round(score * 0.4); // finished trips sink to the bottom

    out.push({ record: r, score, closed, why, changes: ticketChanges(r, fields) });
  });

  out.sort((a, b) => b.score - a.score);
  const open = out.filter((c) => !c.closed);
  return {
    all: out,
    /* only offer a default when one trip is clearly ahead of the next */
    confident: open.length === 1 || (open.length > 1 && open[0].score - open[1].score >= 30),
    tripCount: out.length,
  };
}

/* a reissued ticket means the flight was revised — flag the legs that moved,
   and record who caused it so a carrier change reads differently from ours */
function mergeTicket(record, fields, changes, source) {
  const merged = { ...record, ...fields };
  const touched = (p) => changes.some((c) => c.key.startsWith(p));
  if (touched("arr") && record.arrDate) { merged.arrStatus = "Revised"; merged.arrChangeBy = source || ""; }
  if (touched("dep") && record.depDate) { merged.depStatus = "Revised"; merged.depChangeBy = source || ""; }
  return merged;
}

/* ---------- date helpers ---------- */
const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDate = (iso) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  const mon = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"][+m - 1];
  return `${+d} ${mon} ${String(y).slice(2)}`;
};

function statusOf(r, today) {
  const dates = [r.arrDate, r.depDate].filter(Boolean);
  const isToday = dates.some((d) => d === today);
  const allDone = dates.length > 0 && (!r.arrDate || r.arrDone) && (!r.depDate || r.depDone);
  const open = (!r.arrFlight && !r.depFlight) || (!r.arrDate && !r.depDate);
  const hasFuture = dates.some((d) => d > today);
  if (allDone) return "completed";
  if (isToday) return "today";
  if (open && (hasFuture || dates.length === 0)) return "open";
  if (hasFuture) return "upcoming";
  if (dates.length && dates.every((d) => d < today)) return "completed";
  return "open";
}

/* ------------------------------------------------------------------ */
/*  Departure pickup times                                             */
/*  A driver has to collect someone well before the flight leaves.     */
/*  Pickup = flight time − (check-in at the airport + drive from where  */
/*  they are staying + buffer), less any time saved by FT/CIP.         */
/*  Every number below is editable by the Admin under "Pickup rules".  */
/* ------------------------------------------------------------------ */
const RULES_KEY = "tlt:pickup-rules-v2";
const DEFAULT_RULES = {
  /* ARRIVALS: the driver waits at the airport this many minutes before the plane lands */
  arrLead: 15,

  /* DEPARTURES: the passenger has to be at the airport this many minutes before the
     flight. Two hours at Erbil; Mardin and Shirnak also swallow the road journey and
     the border crossing, which is why they are so much larger. */
  checkIn: { "Erbil (EIA)": 120, Mardin: 420, Shirnak: 450 },

  /* minutes to drive to that airport from wherever the passenger is staying */
  drive: {
    "Erbil Apartment": 30, Home: 40, "Divan Hotel": 25, "Ramada Hotel": 25, EIH: 25,
    "Arjan Rotana": 25, Rotana: 25, PSK: 60, TBC: 30, TWK: 60, RC: 45, FSK: 60,
    Duhok: 150, Zakho: 195, Field: 90,
  },
  driveDefault: 30,

  /* How the service changes the time needed once inside the airport.
     CIP is the quickest route to the aircraft, so it saves the most.
     First Terminal still has to cross to the main terminal, so it saves less.
     Meet & Greet takes a bus to First Terminal and on to the aircraft, so it
     costs time rather than saving it — a positive number here means "start earlier". */
  service: { CIP: -60, FT: -30, "Meet & Greet": 15 },
  buffer: 15,
  minLead: 45,

  /* How long before the driver is due the app raises a reminder. */
  alertLead: 15,

  /* Records whose last movement is older than this drop off the main screen.
     They are never deleted — searching or sorting still reaches them. */
  archiveMonths: 6,
};

const toMin = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t || "").trim());
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  return h < 24 && mm < 60 ? h * 60 + mm : null;
};
const toHHMM = (mins) => {
  const v = ((mins % 1440) + 1440) % 1440;
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
};
const shiftDate = (iso, days) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};
/* "Divan Hotel to EIA" -> "Divan Hotel" */
const originOf = (dest) => String(dest || "").split(/\s+to\s+/i)[0].trim();

/* what the rules say the pickup should be */
function suggestPickup(r, rules) {
  const dep = toMin(r.depTime);
  if (dep === null || !r.depDate) return null;
  const checkIn = rules.checkIn[r.depAirport] ?? rules.checkIn["Erbil (EIA)"];
  const drive = rules.drive[originOf(r.depDest)] ?? rules.driveDefault;
  const svc = rules.service[r.service] || 0;
  const lead = Math.max(rules.minLead, checkIn + drive + svc + rules.buffer);
  const raw = dep - lead;
  return {
    time: toHHMM(raw),
    dayOffset: raw < 0 ? -1 : 0,
    lead, checkIn, drive, svc,
    origin: originOf(r.depDest) || "the hotel",
  };
}

/* ARRIVALS: the driver has to be standing at the airport before the plane touches down */
function meetFor(r, rules) {
  const arr = toMin(r.arrTime);
  if (arr === null || !r.arrDate) return null;
  const lead = rules.arrLead ?? DEFAULT_RULES.arrLead;
  const raw = arr - lead;
  return { time: toHHMM(raw), dayOffset: raw < 0 ? -1 : 0, lead };
}

/* the pickup actually in force: a manual time if someone set one, otherwise the suggestion.
   A pickup later in the clock than the flight must belong to the night before. */
function pickupFor(r, rules) {
  const dep = toMin(r.depTime);
  if (dep === null || !r.depDate) return null;
  const confirmed = !!r.depPickupConfirmed;
  const manual = toMin(r.depPickup);
  if (manual !== null) {
    const offset = manual > dep ? -1 : 0;
    return { time: toHHMM(manual), dayOffset: offset, date: shiftDate(r.depDate, offset), manual: true, confirmed };
  }
  const s = suggestPickup(r, rules);
  if (!s) return null;
  return { ...s, date: shiftDate(r.depDate, s.dayOffset), manual: false, confirmed };
}

/* today's individual movements (a person can have both an arrival and a departure) */
function movementsToday(records, today, rules) {
  const list = [];
  records.forEach((r) => {
    if (r.arrDate === today) {
      const meet = meetFor(r, rules);
      list.push({ kind: "ARR", time: r.arrTime || "—", meet: meet && !meet.dayOffset ? meet.time : "",
        sort: (meet && !meet.dayOffset ? meet.time : r.arrTime) || "99:99", name: r.name, flight: r.arrFlight, airport: r.arrAirport, dest: r.arrDest, fStatus: r.arrStatus, fBy: r.arrChangeBy, service: r.service, driver: r.arrDriver, driverType: r.arrDriverType, done: r.arrDone, id: r.id });
    }

    const p = pickupFor(r, rules);
    const pickupToday = p && p.date === today;
    if (r.depDate === today || pickupToday) {
      list.push({
        kind: "DEP",
        time: r.depTime || "—",
        pickup: p ? p.time : "",
        pickupConfirmed: !!(p && p.confirmed),
        /* the driver leaves at the pickup time, so that is what the board sorts on */
        /* once someone has been collected the night before, the flight time is
           what still matters on the day itself */
        sort: p && pickupToday ? p.time : (r.depTime || "99:99"),
        flightTomorrow: pickupToday && r.depDate !== today,
        pickupWasYesterday: r.depDate === today && p && p.date !== today,
        name: r.name, flight: r.depFlight, airport: r.depAirport, dest: r.depDest,
        fStatus: r.depStatus, fBy: r.depChangeBy, service: r.service, driver: r.depDriver,
        driverType: r.depDriverType, done: r.depDone, id: r.id,
      });
    }
  });
  return list.sort((a, b) => (a.sort > b.sort ? 1 : -1));
}

/* ------------------------------------------------------------------ */
/*  Driver reminders                                                   */
/*  The moment that matters is when the DRIVER has to move, not when   */
/*  the plane does: being at the airport before an arrival lands, or   */
/*  collecting a passenger for a departure. The app watches the clock  */
/*  and raises a reminder shortly before each of those, so someone can */
/*  call the driver. It only works while the app is open somewhere.    */
/* ------------------------------------------------------------------ */
const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

function dueAlerts(records, today, rules, now) {
  const lead = rules.alertLead ?? 15;
  const out = [];
  records.forEach((r) => {
    if (r.arrDate === today && !r.arrDone && !r.arrReminded) {
      const mt = meetFor(r, rules);
      if (mt && !mt.dayOffset) out.push({ record: r, kind: "ARR", at: mt.time, flight: r.arrTime, driver: r.arrDriver });
    }
    const p = pickupFor(r, rules);
    if (p && p.date === today && !r.depDone && !r.depReminded) {
      out.push({ record: r, kind: "DEP", at: p.time, flight: r.depTime, driver: r.depDriver, confirmed: p.confirmed });
    }
  });
  return out
    .map((a) => ({ ...a, left: toMin(a.at) - now }))
    /* due within the lead time, or already past but not by more than an hour */
    .filter((a) => a.left <= lead && a.left > -60)
    .sort((a, b) => a.left - b.left);
}

/* a short double beep, so a reminder is noticed without the app being watched */
function beep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    [0, 0.28].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880; o.type = "sine";
      g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.22);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.24);
    });
  } catch (e) { /* no sound available — the banner still shows */ }
}

function notify(text) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") new Notification("Travel tracker", { body: text });
    else if (Notification.permission !== "denied") Notification.requestPermission();
  } catch (e) { /* blocked in this context — the banner still shows */ }
}

/* ------------------------------------------------------------------ */
/*  Keeping the main screen fast                                       */
/*  After a few years there will be thousands of records. Old ones are */
/*  hidden from the default view, not removed — a search still finds   */
/*  them, and the table draws in pages so a big list never stalls.     */
/* ------------------------------------------------------------------ */
const PAGE_SIZE = 200;

const monthsBack = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
};
/* the last date this record does anything on */
const lastMovement = (r) => {
  const ds = [r.arrDate, r.depDate].filter(Boolean);
  return ds.length ? ds.sort().slice(-1)[0] : "";
};
const isOld = (r, cutoff) => {
  const last = lastMovement(r);
  return !!last && last < cutoff;
};

/* rough size of what is held in shared storage, which has a ceiling near 5 MB */
function storageEstimate(records) {
  const bytes = JSON.stringify(records || []).length;
  /* the ceiling only exists in the browser; behind a server there is none */
  const server = typeof window !== "undefined" && window.__TLT_SERVER === true;
  return { bytes, mb: bytes / 1048576, server,
    pct: server ? 0 : Math.min(100, Math.round((bytes / 5242880) * 100)) };
}

/* ---------- storage ---------- */
/* Records and the team list are SHARED: every person using this app sees the same data. */
/* Three tiers. Super admin runs the system; Movcon does the daily work but cannot
   delete records, change the rules or manage people; Viewer only reads. */
const ROLES = ["Super admin", "Movcon", "Viewer"];
const ROLE_HELP = {
  "Super admin": "everything, including people, rules, deleting and archiving",
  Movcon: "adds and edits records, ticks movements, scans tickets — cannot delete or change settings",
  Viewer: "sees the board and table, can search and export, changes nothing",
};
/* the earlier two-tier wording */
const ROLE_ALIAS = { Admin: "Super admin", Editor: "Movcon", Viewer: "Viewer" };
const normRole = (r) => ROLE_ALIAS[r] || (ROLES.includes(r) ? r : "Viewer");

/* ---- PINs ----
   A PIN is never stored as typed. It is salted and hashed, so a person who
   reaches the stored data cannot read anyone's PIN out of it. This does NOT
   make the data itself private — see the note in Team access. */
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(8)));
async function hashPin(pin, salt) {
  const data = new TextEncoder().encode(`tlt:${salt}:${pin}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}
/* PINs anyone would try first */
const WEAK_PINS = new Set(["0000", "1111", "2222", "3333", "4444", "5555", "6666", "7777", "8888",
  "9999", "1234", "4321", "1212", "0123", "123456", "654321", "111111", "000000"]);
const pinProblem = (pin) => {
  if (!/^\d{4,6}$/.test(pin)) return "PIN must be 4 to 6 digits.";
  if (WEAK_PINS.has(pin)) return "That PIN is too easy to guess — choose another.";
  if (/^(\d)\1+$/.test(pin)) return "Don't use the same digit repeated.";
  return "";
};
/* A recovery code is the way back in when the person who holds the top role
   forgets their PIN and there is nobody above them to reset it. The app cannot
   send email itself, so the code is shown once and the holder mails it to
   themselves; only its hash is ever stored. */
const RECOVERY_GROUPS = 4;
function newRecoveryCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no I/O/0/1
  const bytes = crypto.getRandomValues(new Uint8Array(RECOVERY_GROUPS * 4));
  const chars = [...bytes].map((b) => alphabet[b % alphabet.length]);
  return Array.from({ length: RECOVERY_GROUPS }, (_, i) => chars.slice(i * 4, i * 4 + 4).join("")).join("-");
}
const cleanCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");

async function makeMember(name, role, pin, email = "") {
  const salt = newSalt();
  const m = { name, role, email: email.trim(), salt, hash: await hashPin(pin, salt) };
  if (role === "Super admin") {
    const code = newRecoveryCode();
    m.recSalt = newSalt();
    m.recHash = await hashPin(cleanCode(code), m.recSalt);
    m._code = code; // handed straight to the screen, never stored
  }
  return m;
}
async function attachRecovery(member) {
  const code = newRecoveryCode();
  const recSalt = newSalt();
  return { member: { ...member, recSalt, recHash: await hashPin(cleanCode(code), recSalt) }, code };
}
/* bring an older team list (plain PINs, old role names) up to date */
async function upgradeTeam(team) {
  if (!team || !team.members) return team;
  const members = await Promise.all(team.members.map(async (m) => {
    const role = normRole(m.role);
    if (m.hash && m.salt) return { ...m, role };
    const salt = newSalt();
    return { name: m.name, role, email: m.email || "", salt, hash: await hashPin(String(m.pin ?? ""), salt) };
  }));
  return { ...team, members };
}

const TEAM_KEY = "tlt:team-v1";
const ME_KEY = "tlt:me-v1"; // personal: remembers who you are on this account

/* the most recent shared list this browser has seen, used as the merge base
   when the store cannot be re-read at the moment of saving */
let lastKnownShared = null;

/* Reading has three outcomes and they must not be confused:
     { state: "ok", records }   the store answered with records
     { state: "empty" }         the store answered, and there is nothing yet
     { state: "failed" }        the store could not be read at all
   Only "empty" may seed the starting data. Seeding after a failed read would
   replace the team's real records with the 229 sample rows. */
async function loadRecords() {
  let failed = false;
  try {
    const res = await window.storage.get(STORE_KEY, true);
    if (res && res.value) {
      lastKnownShared = JSON.parse(res.value);
      return { state: "ok", records: lastKnownShared };
    }
  } catch (e) { failed = true; }
  // migrate older personal records into the shared store
  try {
    const old = await window.storage.get(STORE_KEY, false);
    if (old && old.value) {
      const recs = JSON.parse(old.value);
      await window.storage.set(STORE_KEY, JSON.stringify(recs), true);
      lastKnownShared = recs;
      return { state: "ok", records: recs };
    }
  } catch (e) { /* nothing to migrate */ }
  return failed ? { state: "failed" } : { state: "empty" };
}

/* Apply just this browser's change on top of whatever is stored now, instead
   of overwriting the store with this browser's whole list. Two people editing
   different passengers moments apart both keep their work; under a whole-list
   write the second save silently erased the first. */
function mergeIntoBase(base, change) {
  const byId = new Map((base || []).map((r) => [r.id, r]));
  for (const id of change.remove || []) byId.delete(id);
  const fresh = [];
  for (const rec of change.upsert || []) {
    if (byId.has(rec.id)) byId.set(rec.id, rec);
    else fresh.push(rec);
  }
  return [...fresh, ...byId.values()];
}

/* roughly the per-key ceiling; checked here so an oversized save reports the
   real reason instead of an opaque failure from the store */
const STORE_LIMIT = 5 * 1024 * 1024;

/* Throws on failure. The caller has to know: a save that quietly fails looks
   exactly like one that worked, and the edit stays on screen either way. */
async function saveRecords(records, change) {
  let payload = records;

  if (change) {
    let base = lastKnownShared;
    try {
      const res = await window.storage.get(STORE_KEY, true);
      base = res && res.value ? JSON.parse(res.value) : base;
    } catch (e) { /* fall back to the last list this browser saw */ }
    if (base) payload = mergeIntoBase(base, change);
  }

  const text = JSON.stringify(payload);
  if (text.length > STORE_LIMIT) {
    throw new Error(
      `These records need ${(text.length / 1048576).toFixed(1)} MB but the shared ` +
      `store holds ${(STORE_LIMIT / 1048576).toFixed(0)} MB. Archive older records ` +
      `under Pickup rules to bring it back under the limit.`
    );
  }

  await window.storage.set(STORE_KEY, text, true);
  lastKnownShared = payload;
  return payload;
}
async function loadTeam() {
  try {
    const res = await window.storage.get(TEAM_KEY, true);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) { /* no team yet */ }
  return null;
}
async function saveTeam(team) {
  try { await window.storage.set(TEAM_KEY, JSON.stringify(team), true); }
  catch (e) { console.error("team save failed", e); }
}
async function loadMe() {
  try {
    const res = await window.storage.get(ME_KEY, false);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) { /* not remembered */ }
  return null;
}
async function saveMe(me) {
  try {
    if (me) await window.storage.set(ME_KEY, JSON.stringify(me), false);
    else await window.storage.delete(ME_KEY, false);
  } catch (e) { /* ignore */ }
}

/* activity log + recycle bin — shared, so the whole team sees the same history */
const LOG_KEY = "tlt:log-v1";
const TRASH_KEY = "tlt:trash-v1";
async function loadShared(key) {
  try {
    const res = await window.storage.get(key, true);
    if (res && res.value) return JSON.parse(res.value);
  } catch (e) { /* empty */ }
  return [];
}
async function saveShared(key, value) {
  try { await window.storage.set(key, JSON.stringify(value), true); }
  catch (e) { console.error("save failed", key, e); }
}

/* ---------- CSV ---------- */
const CSV_HEADERS = ["No.","Name","Employee Type","Arrival","Arr. Time","Arr. Airport","Arr. Destination","Arr. Driver","Arr. Driver Type","Arrived","Departure","Dep. Time","Dep. Pickup","Dep. Airport","Dep. Destination","Dep. Driver","Dep. Driver Type","Departed","E-Mail date","Received From","Arr. Flight","Arr. Status","Arr. Changed By","Dep. Flight","Dep. Status","Dep. Changed By","Service","Reg by","Remarks"];
function toCSV(records, rules) {
  const rows = records.map((r) => [r.no, r.name, r.employeeType, r.arrDate, r.arrTime, r.arrAirport, r.arrDest, r.arrDriver, r.arrDriverType, r.arrDone ? "Yes" : "", r.depDate, r.depTime, (pickupFor(r, rules)?.time || ""), r.depAirport, r.depDest, r.depDriver, r.depDriverType, r.depDone ? "Yes" : "", r.emailDate, r.receivedFrom, r.arrFlight, r.arrStatus, r.arrChangeBy, r.depFlight, r.depStatus, r.depChangeBy, r.service, r.regBy, r.remarks]);
  return Papa.unparse({ fields: CSV_HEADERS, data: rows });
}
const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
function mapImportedRow(row) {
  const get = (...keys) => {
    for (const k of Object.keys(row)) if (keys.includes(norm(k))) return String(row[k] ?? "").trim();
    return "";
  };
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const fixDate = (v) => {
    if (!v) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // Excel style: 2-Sep-26, 02-Sep-2026, 01-Sep (assume current year)
    const m = v.trim().match(/^(\d{1,2})[-\s/]([A-Za-z]{3,})\.?(?:[-\s/](\d{2,4}))?$/);
    if (m) {
      const mo = MONTHS[m[2].slice(0, 3).toLowerCase()];
      if (mo) {
        let y = m[3] ? parseInt(m[3], 10) : new Date().getFullYear();
        if (y < 100) y += 2000;
        return `${y}-${String(mo).padStart(2, "0")}-${String(parseInt(m[1], 10)).padStart(2, "0")}`;
      }
    }
    const d = new Date(v);
    if (isNaN(d)) return "";
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fixTime = (v) => {
    const m = String(v || "").trim().match(/^(\d{1,2}):(\d{2})/);
    if (!m) return "";
    return `${m[1].padStart(2, "0")}:${m[2]}`;
  };
  const fixAirport = (v) => {
    const t = v.toLowerCase();
    if (!t) return "";
    if (t.includes("erbil") || t.includes("eia")) return "Erbil (EIA)";
    if (t.includes("mardin")) return "Mardin";
    if (t.includes("shirnak") || t.includes("sirnak")) return "Shirnak";
    return v;
  };
  return {
    no: parseInt(get("no", "num"), 10) || null,
    name: get("name", "passengername"),
    employeeType: (() => {
      const v = get("employeetype", "type", "employment").toLowerCase();
      if (v.includes("contract")) return "Contractor";
      if (v.includes("direct") || v.includes("employee")) return "Direct employee";
      return "";
    })(),
    arrDate: fixDate(get("arrival", "arrivaldate", "arr")),
    arrTime: fixTime(get("arrtime", "time", "arrivaltime")),
    arrDest: get("arrdestination", "destination", "arrivaldestination"),
    arrAirport: fixAirport(get("arrairport", "airport")),
    arrDriver: get("arrdriver", "pickupdriver", "driver"),
    arrDriverType: get("arrdrivertype", "pickupdrivertype"),
    arrDone: /^(yes|y|true|1|✓)$/i.test(get("arrived", "arrdone")),
    depDate: fixDate(get("departure", "departuredate", "dep")),
    depTime: fixTime(get("deptime", "departuretime", "time2")),
    depPickup: fixTime(get("deppickup", "pickup", "pickuptime")),
    depDest: get("depdestination", "destination2", "departuredestination"),
    depAirport: fixAirport(get("depairport", "airport2")),
    depDriver: get("depdriver", "dropoffdriver", "driver2"),
    depDriverType: get("depdrivertype", "dropoffdrivertype"),
    depDone: /^(yes|y|true|1|✓)$/i.test(get("departed", "depdone")),
    emailDate: fixDate(get("emaildate", "email")),
    receivedFrom: get("receivedfrom", "received"),
    flight: get("flightad", "flight", "flightno"),
    ...(() => {
      const legacy = splitFlights(get("flightad", "flight"), !!get("arrival", "arrdate"), !!get("departure", "depdate"));
      const st = get("flightstatus", "status");
      return {
        arrFlight: get("arrflight", "arrivalflight") || legacy.arr,
        depFlight: get("depflight", "departureflight") || legacy.dep,
        arrStatus: get("arrstatus", "arrivalstatus") || st || "On schedule",
        depStatus: get("depstatus", "departurestatus") || st || "On schedule",
        arrChangeBy: get("arrchangedby", "arrchangeby"),
        depChangeBy: get("depchangedby", "depchangeby"),
      };
    })(),
    service: get("service") || (/\bcip\b/i.test(get("remarks", "notes")) ? "CIP" : /\bft\b/i.test(get("remarks", "notes")) ? "FT" : ""),
    regBy: get("regby", "registeredby"),
    remarks: get("remarks", "notes"),
  };
}

/* ================================================================== */

export default function TravelLogisticsTracker() {
  const [records, setRecords] = useState(null); // null = loading
  const [team, setTeam] = useState(undefined);  // undefined = loading, null = not set up yet
  const [me, setMe] = useState(null);           // { name, role }
  const [teamOpen, setTeamOpen] = useState(false);
  const [log, setLog] = useState([]);
  const [trash, setTrash] = useState([]);
  const [logOpen, setLogOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("no");
  const [editing, setEditing] = useState(null); // record object or "new"
  const [scanOpen, setScanOpen] = useState(false);
  const [scanMatch, setScanMatch] = useState(null); // { fields, matches } after a scan
  const [importOpen, setImportOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(null);
  const [checkItems, setCheckItems] = useState(null); // [{ record, kind }] or null
  const [rules, setRules] = useState(DEFAULT_RULES);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [showOld, setShowOld] = useState(false);
  const [lookBack, setLookBack] = useState(0); // days of history shown on the board
  const [clock, setClock] = useState(nowMinutes());
  const [muted, setMuted] = useState(false);
  const [newCode, setNewCode] = useState(null); // a freshly issued recovery code, shown once
  const announced = useRef(new Set());
  /* set once the initial load has finished, so the effects below do not write
     the empty starting values back over what was just read */
  const hydrated = useRef(false);
  const [storeError, setStoreError] = useState(null);
  const [page, setPage] = useState(1);
  const today = todayStr();

  useEffect(() => {
    (async () => {
      const [t, remembered, stored, lg, tr, rl] = await Promise.all([
        loadTeam(), loadMe(), loadRecords(), loadShared(LOG_KEY), loadShared(TRASH_KEY),
        loadShared(RULES_KEY),
      ]);
      if (rl && !Array.isArray(rl)) setRules({ ...DEFAULT_RULES, ...rl });
      const upgraded = await upgradeTeam(t);
      if (upgraded && JSON.stringify(upgraded) !== JSON.stringify(t)) saveTeam(upgraded);
      setTeam(upgraded);
      if (upgraded && remembered) {
        /* the browser remembers the hash, never the PIN itself */
        const member = upgraded.members.find((m) => m.name === remembered.name && m.hash === remembered.hash);
        if (member) setMe({ name: member.name, role: member.role });
      }
      if (stored.state === "ok") {
        setRecords(stored.records.map(migrate));
      } else if (stored.state === "empty") {
        /* genuinely nothing saved yet, so it is safe to lay down the starting data */
        const seed = masterSheetRecords();
        setRecords(seed);
        saveRecords(seed).catch((e) => setStoreError(e.message || String(e)));
      } else {
        /* the store could not be read. Seeding here would overwrite the team's
           real records with the sample data, so say so and change nothing. */
        setRecords([]);
        setStoreError(
          "Could not read the shared records. Nothing has been changed — check " +
          "your connection and reload the page."
        );
      }
      setLog(lg); setTrash(tr);
      hydrated.current = true;
    })();
  }, []);

  const addLog = (action, rec, details) => {
    const entry = {
      ts: Date.now(),
      user: me ? me.name : "?",
      action,
      no: rec ? rec.no : undefined,
      name: rec ? rec.name : undefined,
      details: details || "",
    };
    /* saved by the effect below: React may replay an updater, and doing the
       write in here made that a duplicate save */
    setLog((prev) => [entry, ...prev].slice(0, 500));
  };

  const canEdit = me && me.role !== "Viewer";
  const isSuper = me && me.role === "Super admin";

  /* `change` describes what this browser altered, so the save can be merged
     into whatever colleagues have stored since. Omit it only for a deliberate
     wholesale replacement. */
  const persist = (next, change) => {
    setRecords(next);
    setStoreError(null);
    saveRecords(next, change)
      .then((stored) => {
        /* adopt the merged result, so a colleague's edit appears immediately
           rather than at the next reload */
        if (change && stored) setRecords(stored);
      })
      .catch((e) => setStoreError(e.message || "The change could not be saved."));
  };

  /* the activity log and recycle bin are saved here rather than inside a state
     updater, so each change is written exactly once */
  useEffect(() => { if (hydrated.current) saveShared(LOG_KEY, log); }, [log]);
  useEffect(() => { if (hydrated.current) saveShared(TRASH_KEY, trash); }, [trash]);

  const nextNo = useMemo(() => {
    if (!records || !records.length) return 1;
    return Math.max(...records.map((r) => r.no || 0)) + 1;
  }, [records]);

  /* The board looks forward by default. Managers regularly ask about someone who
     landed or left a day or two ago, so the past few days can be pulled in too. */
  const days = useMemo(() => {
    if (!records) return [];
    const offsets = [];
    for (let i = lookBack; i >= 1; i--) offsets.push(-i);
    offsets.push(0, 1, 2);
    return offsets.map((off) => {
      const date = shiftDate(today, off);
      const weekday = new Date(date + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" });
      const items = movementsToday(records, date, rules);
      return {
        date,
        past: off < 0,
        label: off === 0 ? "Today" : off === 1 ? "Tomorrow" : off === -1 ? "Yesterday" : weekday,
        items,
        doneCount: items.filter((m) => m.done).length,
      };
    });
  }, [records, today, rules, lookBack]);

  const board = useMemo(() => (records ? movementsToday(records, today, rules) : []), [records, today, rules]);

  const saveRules = (next) => {
    setRules(next);
    saveShared(RULES_KEY, next);
    addLog("pickup rules changed", null, "airport check-in / drive times updated");
  };
  const counts = useMemo(() => {
    if (!records) return { today: 0, upcoming: 0, open: 0 };
    let t = 0, u = 0, o = 0;
    records.forEach((r) => {
      const s = statusOf(r, today);
      if (s === "today") t++;
      else if (s === "upcoming") u++;
      else if (s === "open") o++;
    });
    return { today: t, upcoming: u, open: o };
  }, [records, today]);

  /* the clock only needs to move once a minute for the reminders to be timely */
  useEffect(() => {
    const t = setInterval(() => setClock(nowMinutes()), 30000);
    return () => clearInterval(t);
  }, []);

  const alerts = useMemo(
    () => (records ? dueAlerts(records, today, rules, clock) : []),
    [records, today, rules, clock]);

  useEffect(() => {
    alerts.forEach((a) => {
      /* the day is part of the key: a flight moved to another date has to be
         announced again rather than being suppressed by the earlier one */
      const key = a.record.id + a.kind + today;
      if (announced.current.has(key)) return;
      announced.current.add(key);
      const what = a.kind === "ARR"
        ? `Be at the airport by ${a.at} for ${a.record.name} landing ${a.flight}`
        : `Collect ${a.record.name} at ${a.at} for the ${a.flight} flight`;
      notify(what);
      if (!muted) beep();
    });
  }, [alerts, muted, today]);

  /* the pick-up time only becomes dependable once the passenger has agreed to it */
  const toggleConfirm = (rec) => {
    const now = rec.depPickupConfirmed ? null : { at: Date.now(), by: me.name };
    const p = pickupFor(rec, rules);
    const updated = { ...rec, depPickupConfirmed: now };
    persist(records.map((r) => (r.id === rec.id ? updated : r)), { upsert: [updated] });
    addLog(now ? "pick-up confirmed" : "pick-up unconfirmed", rec,
      `${p ? p.time : "—"}${p && p.dayOffset ? " the night before" : ""}${rec.depDest ? ` from ${originOf(rec.depDest)}` : ""}`);
  };

  const markReminded = (a) => {
    const field = a.kind === "ARR" ? "arrReminded" : "depReminded";
    const updated = { ...a.record, [field]: { at: Date.now(), by: me.name } };
    persist(records.map((r) => (r.id === a.record.id ? updated : r)), { upsert: [updated] });
    addLog("driver reminded", a.record,
      `${a.kind === "ARR" ? "airport pick-up" : "collection"} at ${a.at}${a.driver ? ` — ${a.driver}` : " — no driver assigned"}`);
  };

  const cutoff = useMemo(() => monthsBack(today, rules.archiveMonths ?? 6), [today, rules.archiveMonths]);
  const oldCount = useMemo(
    () => (records ? records.filter((r) => isOld(r, cutoff)).length : 0), [records, cutoff]);

  const visible = useMemo(() => {
    if (!records) return [];
    const q = query.trim().toLowerCase();
    /* a search always looks through everything, including the old records */
    const hideOld = !q && !showOld;
    return records
      .filter((r) => {
        if (hideOld && isOld(r, cutoff)) return false;
        if (filter === "issues") {
          const bad = (v) => v && v !== "On schedule";
          if (!bad(r.arrStatus) && !bad(r.depStatus)) return false;
        } else if (filter === "recent") {
          /* anything that moved in the last week, for "did so-and-so land yesterday?" */
          const week = shiftDate(today, -7);
          const moved = [r.arrDate, r.depDate].filter(Boolean).some((d) => d >= week && d <= today);
          if (!moved) return false;
        } else if (filter !== "all" && statusOf(r, today) !== filter) return false;
        if (!q) return true;
        return [r.name, r.arrFlight, r.depFlight, r.arrDest, r.depDest, r.receivedFrom, r.regBy, r.remarks, r.service, r.arrStatus, r.depStatus, r.arrDriver, r.depDriver, r.employeeType, r.arrAirport, r.depAirport]
          .some((v) => String(v || "").toLowerCase().includes(q));
      })
      .sort((a, b) => {
        const byDate = (x, y) => (!x ? 1 : !y ? -1 : x < y ? -1 : x > y ? 1 : 0); // empty dates last
        if (sortBy === "name") return a.name.localeCompare(b.name);
        if (sortBy === "arr") return byDate(a.arrDate, b.arrDate);
        if (sortBy === "dep") return byDate(a.depDate, b.depDate);
        return (b.no || 0) - (a.no || 0); // newest record first
      });
  }, [records, query, filter, sortBy, today, cutoff, showOld]);

  const shown = useMemo(() => visible.slice(0, page * PAGE_SIZE), [visible, page]);
  useEffect(() => { setPage(1); }, [query, filter, sortBy, showOld]);
  /* the past-week view is read chronologically, not by record number */
  useEffect(() => { if (filter === "recent" && sortBy === "no") setSortBy("arr"); }, [filter]);

  /* ---------- actions ---------- */
  const saveRecord = (data) => {
    const { _revision, ...rec } = data;
    /* a confirmation ticked in the form still needs a name against it */
    if (rec.depPickupConfirmed && !rec.depPickupConfirmed.by) {
      rec.depPickupConfirmed = { ...rec.depPickupConfirmed, by: me.name };
    }
    if (rec.id) {
      persist(records.map((r) => (r.id === rec.id ? rec : r)), { upsert: [rec] });
      if (_revision) addLog("ticket revised", rec, `new ticket scanned — ${_revision}`);
      else addLog("edited", rec);
    } else {
      const fresh = { ...rec, id: String(Date.now()), no: nextNo };
      persist([fresh, ...records], { upsert: [fresh] });
      addLog("added", fresh, _revision ? "from a scanned ticket" : "");
    }
    setEditing(null);
  };

  const deleteRecord = (rec) => {
    persist(records.filter((r) => r.id !== rec.id), { remove: [rec.id] });
    setTrash((prev) => [{ ...rec, deletedBy: me.name, deletedAt: Date.now() }, ...prev].slice(0, 100));
    addLog("deleted", rec, "moved to recycle bin");
    setConfirmDel(null);
  };

  const restoreRecord = (rec) => {
    setTrash((prev) => prev.filter((t) => t.id !== rec.id));
    const { deletedBy, deletedAt, ...clean } = rec;
    const restored = migrate(clean);
    persist([restored, ...records], { upsert: [restored] });
    addLog("restored", rec, `originally deleted by ${rec.deletedBy}`);
  };

  const toggleDone = (id, field) => {
    const rec = records.find((r) => r.id === id);
    const nowDone = rec && !rec[field];
    const next = records.map((r) => (r.id === id ? { ...r, [field]: !r[field] } : r));
    persist(next, rec ? { upsert: [next.find((r) => r.id === id)] } : undefined);
    if (rec) addLog(
      field === "arrDone"
        ? (nowDone ? "marked arrived" : "unmarked arrived")
        : (nowDone ? "marked departed" : "unmarked departed"),
      rec
    );
  };

  const applyCheck = (item, data, flightNo) => {
    const { record, kind } = item;
    const isArr = kind === "ARR";
    const status = CHECK_TO_STATUS[data.status] || (isArr ? record.arrStatus : record.depStatus);
    const timeField = isArr ? "arrTime" : "depTime";
    const patch = {
      [isArr ? "arrStatus" : "depStatus"]: status,
      /* anything the flight sites report is the carrier's doing */
      [isArr ? "arrChangeBy" : "depChangeBy"]: status === "On schedule" ? "" : "Airline",
      [isArr ? "arrCheck" : "depCheck"]: {
        at: Date.now(), by: me.name, flightNo, leg: kind,
        status: data.status, note: data.note || "", source: data.source || "",
      },
    };
    if (data.actual && /^\d{2}:\d{2}$/.test(data.actual)) patch[timeField] = data.actual;
    const updated = { ...record, ...patch };
    persist(records.map((r) => (r.id === record.id ? updated : r)), { upsert: [updated] });
    addLog("flight check applied", record,
      `${flightNo} ${kind} — ${data.status} per the airline${data.actual ? `, time set to ${data.actual}` : ""}${data.source ? ` (${data.source})` : ""}`);
  };

  const checkTodaysFlights = () => {
    const items = [];
    records.forEach((r) => {
      if (r.arrDate === today && !r.arrDone) items.push({ record: r, kind: "ARR" });
      if (r.depDate === today && !r.depDone) items.push({ record: r, kind: "DEP" });
    });
    setCheckItems(items);
  };

  /* the honest fix for a full store: take the oldest records out, but only
     after they have been written to a file the office keeps */
  const archiveOld = () => {
    const months = rules.archiveMonths ?? 6;
    const line = monthsBack(today, months);
    const old = records.filter((r) => isOld(r, line));
    if (!old.length) { alert(`No records are older than ${months} months.`); return; }
    if (!window.confirm(
      `${old.length} records have no movement since ${fmtDate(line)}.\n\n` +
      `They will be downloaded as a CSV file first, then removed from the app. ` +
      `Keep that file — this cannot be undone from the recycle bin.\n\nContinue?`)) return;

    const blob = new Blob([toCSV(old, rules)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `travel-archive-to-${line}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);

    persist(records.filter((r) => !isOld(r, line)), { remove: old.map((r) => r.id) });
    addLog("archived", null, `${old.length} records with no movement since ${fmtDate(line)} exported and removed`);
    setRulesOpen(false);
  };

  const exportCSV = () => {
    const blob = new Blob([toCSV(records, rules)], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `travel-tracker-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const applyImport = (rows, mode) => {
    if (!rows.length) return { added: 0, skipped: 0, removed: 0 };

    const replace = mode === "replace";
    const existingNos = new Set(replace ? [] : records.map((r) => r.no).filter(Boolean));
    const fresh = [];
    let skipped = 0;
    rows.forEach((r) => {
      if (r.no && existingNos.has(r.no)) { skipped++; return; } // already in the app
      if (r.no) existingNos.add(r.no);
      fresh.push(r);
    });

    let n = replace ? 1 : nextNo;
    const stamp = Date.now();
    const withIds = fresh.map((r, i) => ({
      ...r,
      id: r.id || String(stamp + i) + Math.random().toString(36).slice(2, 6),
      no: r.no || n++,
    })).map(migrate).map((r) => {
      /* a pickup that simply matches the rules stays automatic, so it keeps
         following the flight time instead of being frozen at import */
      const s = suggestPickup(r, rules);
      return s && r.depPickup === s.time ? { ...r, depPickup: "" } : r;
    });

    const removed = replace ? records.length : 0;
    /* "replace everything" is a deliberate wholesale write, and the one case
       that must not merge with what is already stored */
    persist(
      replace ? withIds : [...withIds, ...records],
      replace ? undefined : { upsert: withIds },
    );
    return { added: withIds.length, skipped, removed };
  };

  const importBuiltIn = (mode) => {
    const res = applyImport(masterSheetRecords(), mode);
    addLog("imported", null, mode === "replace"
      ? `${res.added} records loaded from the Master Sheet — replaced all ${res.removed} previous records (go-live)`
      : `${res.added} records loaded from the Master Sheet${res.skipped ? `, ${res.skipped} already present` : ""}`);
    return res;
  };

  const importCSV = (text, mode = "add") => {
    const seen = {};
    const parsed = Papa.parse(text.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => {
        const k = String(h || "").trim();
        seen[k] = (seen[k] || 0) + 1;
        return seen[k] > 1 ? `${k} ${seen[k]}` : k; // second "Time" -> "Time 2"
      },
    });
    const rows = parsed.data.map(mapImportedRow).filter((r) => r.name);
    const res = applyImport(rows, mode);
    if (res.added) addLog("imported", null, mode === "replace"
      ? `${res.added} records from CSV — replaced all ${res.removed} previous records`
      : `${res.added} records from CSV${res.skipped ? `, ${res.skipped} skipped as already present` : ""}`);
    return res;
  };

  if (records === null || team === undefined) {
    return <div className="tlt"><style>{CSS}</style><div className="loading">Loading records…</div></div>;
  }

  /* first ever user sets up the team as Admin */
  if (team === null) {
    return (
      <div className="tlt"><style>{CSS}</style>
        <SetupScreen onDone={({ _code, ...admin }) => {
          const t = { members: [admin] };
          setTeam(t); saveTeam(t);
          setMe({ name: admin.name, role: "Super admin" });
          saveMe({ name: admin.name, hash: admin.hash });
        }} />
      </div>
    );
  }

  /* everyone else signs in with their name + PIN */
  if (!me) {
    return (
      <div className="tlt"><style>{CSS}</style>
        <LoginScreen team={team}
          onLogin={(member) => {
            setMe({ name: member.name, role: member.role });
            saveMe({ name: member.name, hash: member.hash });
          }}
          onRecover={async (member, pin) => {
            /* a used recovery code is spent: set the new PIN and issue a fresh code */
            const salt = newSalt();
            const hash = await hashPin(pin, salt);
            const { member: withCode, code } = await attachRecovery({ ...member, salt, hash });
            const next = { ...team, members: team.members.map((m) => (m.name === member.name ? withCode : m)) };
            setTeam(next); saveTeam(next);
            setMe({ name: withCode.name, role: withCode.role });
            saveMe({ name: withCode.name, hash });
            setNewCode({ name: withCode.name, code });
            addLog("PIN recovered", null, `${member.name} signed in with a recovery code and set a new PIN`);
          }}
        />
      </div>
    );
  }

  return (
    <div className="tlt">
      <style>{CSS}</style>

      {/* A failed read or write must be impossible to miss: the edit stays on
          screen either way, so without this a lost change looks like a saved one. */}
      {storeError && (
        <div className="store-error" role="alert">
          <strong>Not saved.</strong> {storeError}
          <button className="btn ghost sm" onClick={() => window.location.reload()}>Reload</button>
          <button className="btn ghost sm" onClick={() => setStoreError(null)}>Dismiss</button>
        </div>
      )}

      {newCode && (
        <div className="overlay">
          <div className="modal">
            <h2>Your new recovery code</h2>
            <p className="modal-sub">
              The old one is now dead. Save this replacement the same way — it is shown once only.
            </p>
            <div className="rec-code">{newCode.code}</div>
            <div className="rec-actions">
              <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(newCode.code)}>Copy</button>
              <a className="btn ghost" href={`mailto:?subject=${encodeURIComponent("Travel tracker recovery code")}&body=${
                encodeURIComponent(`Keep this somewhere safe.\n\nRecovery code: ${newCode.code}\nFor: ${newCode.name} (Super admin)`)}`}>
                Email it to myself
              </a>
            </div>
            <div className="modal-actions">
              <button className="btn primary" onClick={() => setNewCode(null)}>I have saved it</button>
            </div>
          </div>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="alerts">
          <div className="alerts-head">
            <b>{alerts.length === 1 ? "Driver reminder" : `${alerts.length} driver reminders`}</b>
            <button className="who-btn" onClick={() => setMuted((v) => !v)}>
              {muted ? "Sound off" : "Sound on"}
            </button>
          </div>
          <ul>
            {alerts.map((a) => (
              <li key={a.record.id + a.kind} className={a.left < 0 ? "late" : ""}>
                <span className="al-when">
                  {a.left < 0 ? `${Math.abs(a.left)} min late` : a.left === 0 ? "now" : `in ${a.left} min`}
                </span>
                <span className="al-what">
                  <b>{a.at}</b> — {a.kind === "ARR" ? "be at the airport for" : "collect"} {a.record.name}
                  <span className="al-sub">
                    {a.kind === "ARR" ? `lands ${a.flight}` : `flight ${a.flight}`}
                    {a.kind === "DEP" && (a.confirmed ? " · pick-up confirmed" : " · pick-up NOT confirmed")}
                    {" · "}
                    {a.driver || "no driver assigned"}
                  </span>
                </span>
                {canEdit && (
                  <button className="mini" onClick={() => markReminded(a)}>Driver told</button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ---------- movement board ---------- */}
      <header className="board">
        <div className="board-top">
          <div>
            <h1>Dashboard</h1>
            <div className="board-date">Next three days · {new Date().toDateString()}</div>
          </div>
          <div className="tallies">
            <div className="tally"><span className="tally-n hl">{counts.today}</span><span>today</span></div>
            <div className="tally"><span className="tally-n">{counts.upcoming}</span><span>upcoming</span></div>
            <div className="tally"><span className="tally-n warn">{counts.open}</span><span>open</span></div>
          </div>
        </div>
        <div className="who">
          <span>Signed in: <b>{me.name}</b> · {me.role}</span>
          <button className="who-btn" onClick={() => setLogOpen(true)}>
            Activity{trash.length ? ` · ${trash.length} in bin` : ""}
          </button>
          {isSuper && <button className="who-btn" onClick={() => setTeamOpen(true)}>Team access</button>}
          {isSuper && <button className="who-btn" onClick={() => setRulesOpen(true)}>Rules &amp; settings</button>}
          {board.some((m) => !m.done) && (
            <button className="who-btn hl-btn" onClick={checkTodaysFlights}>Check today's flights</button>
          )}
          <button className="who-btn" onClick={() => { setMe(null); saveMe(null); }}>Sign out</button>
        </div>
        <div className="dash-controls">
          <span className="dash-ctl-label">Look back</span>
          {[0, 2, 5].map((n) => (
            <button key={n} className={"chip dark" + (lookBack === n ? " on" : "")}
              onClick={() => setLookBack(n)}>
              {n === 0 ? "Off" : `${n} days`}
            </button>
          ))}
        </div>

        <div className="dash">
          {days.map((d) => {
            const arrivals = d.items.filter((m) => m.kind === "ARR");
            const departures = d.items.filter((m) => m.kind === "DEP");
            return (
              <section className={"dash-day" + (d.past ? " past" : "")} key={d.date}>
                <div className="dash-head">
                  <b>{d.label}</b>
                  <span>{fmtDate(d.date)}</span>
                  {d.past && d.items.length > 0 && (
                    <span className={"day-tick" + (d.doneCount === d.items.length ? " all" : "")}>
                      {d.doneCount} of {d.items.length} ticked
                    </span>
                  )}
                </div>

                {arrivals.length > 0 && (
                  <>
                    <div className="dash-sub arr">Arrivals · {arrivals.length}</div>
                    <ul className="board-list">
                      {arrivals.map((m, i) => <MoveRow m={m} key={m.id + i} />)}
                    </ul>
                  </>
                )}

                {departures.length > 0 && (
                  <>
                    <div className="dash-sub dep">Departures · {departures.length}</div>
                    <ul className="board-list">
                      {departures.map((m, i) => <MoveRow m={m} key={m.id + i} />)}
                    </ul>
                  </>
                )}

                {d.items.length === 0 && <div className="board-empty">Nothing scheduled.</div>}
              </section>
            );
          })}
        </div>
      </header>

      {/* ---------- toolbar ---------- */}
      <div className="toolbar">
        <input
          className="search"
          placeholder="Search name, flight, destination…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chips">
          {[["all", "All"], ["today", "Today"], ["recent", "Last 7 days"], ["upcoming", "Upcoming"], ["open", "Open"], ["issues", "Flight issues"], ["completed", "Completed"]].map(([k, label]) => (
            <button key={k} className={"chip" + (filter === k ? " on" : "")} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <div className="tools">
          <select className="sort-select" value={sortBy} onChange={(e) => setSortBy(e.target.value)} aria-label="Sort records">
            <option value="no">Sort: newest first</option>
            <option value="name">Sort: name A–Z</option>
            <option value="arr">Sort: arrival date</option>
            <option value="dep">Sort: departure date</option>
          </select>
          {isSuper && <button className="btn ghost" onClick={() => setImportOpen(true)}>Load records</button>}
          <button className="btn ghost" onClick={exportCSV}>Export CSV</button>
          {canEdit && <button className="btn ghost scan-btn" onClick={() => setScanOpen(true)}>Scan ticket</button>}
          {canEdit && <button className="btn primary" onClick={() => setEditing({ ...BLANK })}>Add passenger</button>}
        </div>
      </div>

      {/* ---------- table ---------- */}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>No.</th><th>Name</th>
              <th className="th-arr">Arrival</th><th className="th-arr">Destination</th>
              <th className="th-dep">Departure</th><th className="th-dep">Destination</th>
              <th>E-mail</th><th>Received</th><th>Reg by</th><th>Remarks</th><th></th>
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr><td colSpan={11} className="empty-row">No records match. Add a passenger or adjust the filters.</td></tr>
            )}
            {shown.map((r) => {
              const s = statusOf(r, today);
              return (
                <tr key={r.id} className={s === "today" ? "row-today" : ""}>
                  <td className="mono">{r.no}</td>
                  <td className="name-cell">
                    {r.name}
                    {r.employeeType && (
                      <span className={"tag " + (r.employeeType === "Contractor" ? "ctr-tag" : "emp-tag")}>
                        {r.employeeType === "Contractor" ? "Contractor" : "Direct"}
                      </span>
                    )}
                    {r.service && <span className="tag svc-tag">{r.service}</span>}
                    {s === "today" && <span className="tag today-tag">today</span>}
                    {s === "open" && <span className="tag open-tag">open</span>}
                  </td>
                  <td className="cell-arr mono">
                    {(r.arrDate || r.arrTime) && (
                      <button
                        className={"tick" + (r.arrDone ? " done" : "")}
                        title={r.arrDone ? "Arrived — click to undo" : "Mark as arrived"}
                        disabled={!canEdit}
                        onClick={() => canEdit && toggleDone(r.id, "arrDone")}
                      >✓</button>
                    )}
                    {fmtDate(r.arrDate)}{r.arrTime ? ` · ${r.arrTime}` : ""}
                    {(() => {
                      const mt = meetFor(r, rules);
                      return mt ? <div className="pickup meet">↓ driver by {mt.time}</div> : null;
                    })()}
                    <FlightCell no={r.arrFlight} airport={r.arrAirport} status={r.arrStatus}
                      changeBy={r.arrChangeBy} check={r.arrCheck} show={!!(r.arrDate || r.arrTime)} />
                  </td>
                  <td className="cell-arr">
                    {r.arrDest}
                    {r.arrDriver && <div className="driver">🚗 {r.arrDriver}{r.arrDriverType ? ` · ${r.arrDriverType}` : ""}</div>}
                  </td>
                  <td className="cell-dep mono">
                    {(r.depDate || r.depTime) && (
                      <button
                        className={"tick" + (r.depDone ? " done" : "")}
                        title={r.depDone ? "Departed — click to undo" : "Mark as departed"}
                        disabled={!canEdit}
                        onClick={() => canEdit && toggleDone(r.id, "depDone")}
                      >✓</button>
                    )}
                    {fmtDate(r.depDate)}{r.depTime ? ` · ${r.depTime}` : ""}
                    {(() => {
                      const p = pickupFor(r, rules);
                      if (!p) return null;
                      return (
                        <div className={"pickup" + (p.manual ? " manual" : "")}>
                          ↑ pick up {p.time}{p.dayOffset ? " (night before)" : ""}
                          <span className={p.confirmed ? "pk-ok" : "pk-no"}>
                            {p.confirmed ? "✓ confirmed" : "to confirm"}
                          </span>
                        </div>
                      );
                    })()}
                    <FlightCell no={r.depFlight} airport={r.depAirport} status={r.depStatus}
                      changeBy={r.depChangeBy} check={r.depCheck} show={!!(r.depDate || r.depTime)} />
                  </td>
                  <td className="cell-dep">
                    {r.depDest}
                    {r.depDriver && <div className="driver">🚗 {r.depDriver}{r.depDriverType ? ` · ${r.depDriverType}` : ""}</div>}
                  </td>
                  <td className="mono dim">{fmtDate(r.emailDate)}</td>
                  <td>{r.receivedFrom}</td>
                  <td>{r.regBy}</td>
                  <td className="remarks">{r.remarks}</td>
                  <td className="row-actions">
                    {canEdit && <button className="mini" onClick={() => setEditing(r)}>Edit</button>}
                    {canEdit && r.depDate && r.depTime && !r.depDone && (
                      <button className={"mini" + (r.depPickupConfirmed ? " on" : "")}
                        title={r.depPickupConfirmed
                          ? `Confirmed by ${r.depPickupConfirmed.by} — click to undo`
                          : "Mark the pick-up time as agreed with the passenger"}
                        onClick={() => toggleConfirm(r)}>
                        {r.depPickupConfirmed ? "✓ Pick-up" : "Confirm pick-up"}
                      </button>
                    )}
                    {((r.arrFlight && r.arrDate && !r.arrDone) || (r.depFlight && r.depDate && !r.depDone)) && (
                      <button className="mini" onClick={() => setCheckItems(
                        [r.arrFlight && r.arrDate && !r.arrDone ? { record: r, kind: "ARR" } : null,
                         r.depFlight && r.depDate && !r.depDone ? { record: r, kind: "DEP" } : null].filter(Boolean)
                      )}>Check</button>
                    )}
                    {isSuper && <button className="mini danger" onClick={() => setConfirmDel(r)}>Delete</button>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length < visible.length && (
        <div className="more-row">
          <button className="btn ghost" onClick={() => setPage((n) => n + 1)}>
            Show {Math.min(PAGE_SIZE, visible.length - shown.length)} more
          </button>
          <span className="log-meta">{shown.length} of {visible.length} shown</span>
        </div>
      )}

      <div className="foot">
        {visible.length} of {records.length} records · shared live with your whole team
        {oldCount > 0 && (
          query.trim() ? (
            <span className="foot-note"> · searching all records, including {oldCount} older ones</span>
          ) : showOld ? (
            <span className="foot-note"> · <button className="link-btn inline" onClick={() => setShowOld(false)}>
              hide the {oldCount} records older than {rules.archiveMonths ?? 6} months</button></span>
          ) : (
            <span className="foot-note"> · {oldCount} older than {rules.archiveMonths ?? 6} months are hidden.{" "}
              <button className="link-btn inline" onClick={() => setShowOld(true)}>Show them</button></span>
          )
        )}
      </div>

      {/* ---------- activity log + recycle bin ---------- */}
      {logOpen && (
        <LogModal log={log} trash={trash} isSuper={isSuper}
          onRestore={restoreRecord} onClose={() => setLogOpen(false)} />
      )}

      {/* ---------- team access modal (admin only) ---------- */}
      {teamOpen && isSuper && (
        <TeamModal team={team} meName={me.name}
          onSave={(t) => { setTeam(t); saveTeam(t); }}
          onClose={() => setTeamOpen(false)} />
      )}

      {/* ---------- edit modal ---------- */}
      {editing && <EditModal record={editing} rules={rules} onSave={saveRecord} onClose={() => setEditing(null)} />}

      {/* ---------- ticket scan modal ---------- */}
      {scanOpen && (
        <TicketScanModal
          onClose={() => setScanOpen(false)}
          onResult={(fields) => {
            setScanOpen(false);
            const result = findTicketMatches(fields, records, today);
            if (result.all.length) setScanMatch({ fields, result });
            else setEditing({ ...BLANK, ...fields });
          }}
        />
      )}

      {scanMatch && (
        <TicketMatchModal
          fields={scanMatch.fields}
          result={scanMatch.result}
          onClose={() => setScanMatch(null)}
          onCreate={() => { setEditing({ ...BLANK, ...scanMatch.fields }); setScanMatch(null); }}
          onUpdate={({ record, changes }, source) => {
            setEditing({
              ...mergeTicket(record, scanMatch.fields, changes, source),
              _revision: changes.length
                ? `${changes.map((c) => `${c.label} ${c.from} → ${c.to}`).join("; ")}${source ? ` — changed by ${source.toLowerCase()}` : ""}`
                : "re-scanned, no change",
            });
            setScanMatch(null);
          }}
        />
      )}

      {/* ---------- import modal ---------- */}
      {rulesOpen && <RulesModal rules={rules} onSave={saveRules} records={records}
        onArchive={archiveOld} onClose={() => setRulesOpen(false)} />}
      {checkItems && <FlightCheckModal items={checkItems} today={today} canEdit={canEdit}
        onApply={applyCheck} onClose={() => setCheckItems(null)} />}
      {importOpen && <ImportModal onImport={importCSV} onImportBuiltIn={importBuiltIn}
        isSuper={isSuper} existingCount={records.length}
        onClose={() => setImportOpen(false)} />}

      {/* ---------- delete confirm ---------- */}
      {confirmDel && (
        <div className="overlay" onClick={() => setConfirmDel(null)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <h2>Delete record {confirmDel.no}?</h2>
            <p className="modal-sub">{confirmDel.name} — this can't be undone.</p>
            <div className="modal-actions">
              <button className="btn ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
              <button className="btn danger" onClick={() => deleteRecord(confirmDel)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- dropdown that allows a free-text "Other" value ---- */
function SelectOrOther({ label, value, options, onChange, placeholder }) {
  const isListed = value === "" || options.includes(value);
  const [other, setOther] = useState(!isListed);
  return (
    <label className="fl">{label}
      <select
        value={other ? "__other" : value}
        onChange={(e) => {
          if (e.target.value === "__other") { setOther(true); onChange(""); }
          else { setOther(false); onChange(e.target.value); }
        }}
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value="__other">Other…</option>
      </select>
      {other && (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoFocus />
      )}
    </label>
  );
}

/* ---- strict 24-hour time input (HH:MM), independent of device AM/PM setting ---- */
function Time24({ label, value, onChange }) {
  const [bad, setBad] = useState(false);
  const handle = (e) => {
    let v = e.target.value.replace(/[^\d:]/g, "");
    if (/^\d{3,}$/.test(v)) v = v.slice(0, 2) + ":" + v.slice(2, 4); // typing 1355 -> 13:55
    if (v.length > 5) v = v.slice(0, 5);
    onChange(v);
    setBad(false);
  };
  const finish = () => {
    if (!value) { setBad(false); return; }
    const m = value.match(/^(\d{1,2}):?(\d{0,2})$/);
    if (!m) { setBad(true); return; }
    const h = parseInt(m[1], 10);
    const mi = m[2] ? parseInt(m[2], 10) : 0;
    if (h > 23 || mi > 59) { setBad(true); return; }
    onChange(`${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`);
    setBad(false);
  };
  return (
    <label className="fl">{label}
      <input
        value={value}
        onChange={handle}
        onBlur={finish}
        placeholder="HH:MM"
        inputMode="numeric"
        maxLength={5}
        className={bad ? "bad-time" : ""}
      />
      {bad && <span className="time-hint">24-hour time, 00:00–23:59</span>}
    </label>
  );
}

/* ================= edit modal ================= */
function EditModal({ record, rules, onSave, onClose }) {
  const [f, setF] = useState({ ...BLANK, ...record });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const ok = f.name.trim().length > 0;

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{record.id ? `Edit record ${record.no}` : "Add passenger"}</h2>

        <div className="grid2">
          <label className="fl">Passenger name
            <input value={f.name} onChange={set("name")} placeholder="Full name" autoFocus />
          </label>
          <label className="fl">Employee type
            <select value={f.employeeType} onChange={set("employeeType")}>
              <option value="">—</option>
              {EMPLOYEE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>

        <div className="pair-block arr-block">
          <div className="pair-title">Arrival</div>
          <div className="grid3">
            <label className="fl">Date<input type="date" value={f.arrDate} onChange={set("arrDate")} /></label>
            <Time24 label="Time" value={f.arrTime} onChange={(v) => setF({ ...f, arrTime: v })} />
            <SelectOrOther label="Airport" value={f.arrAirport} options={AIRPORTS}
              onChange={(v) => setF({ ...f, arrAirport: v })} placeholder="Type airport…" />
          </div>
          <div className="grid2">
            <label className="fl">Inbound flight no.<input value={f.arrFlight} onChange={set("arrFlight")} placeholder="G9 357" /></label>
            <label className="fl">Flight status
              <select value={f.arrStatus} onChange={set("arrStatus")}>
                {FLIGHT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          {f.arrStatus && f.arrStatus !== "On schedule" && (
            <label className="fl">Changed by
              <select value={f.arrChangeBy} onChange={set("arrChangeBy")}>
                <option value="">— not recorded —</option>
                {CHANGE_SOURCES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          <SelectOrOther label="Destination" value={f.arrDest} options={ARR_DESTS}
            onChange={(v) => setF({ ...f, arrDest: v })} placeholder="Type destination…" />
          <div className="grid3">
            <label className="fl">Pickup driver<input value={f.arrDriver} onChange={set("arrDriver")} placeholder="Driver name" /></label>
            <label className="fl">Driver type
              <select value={f.arrDriverType} onChange={set("arrDriverType")}>
                <option value="">—</option>
                {DRIVER_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="check-fl">
              <input type="checkbox" checked={!!f.arrDone} onChange={(e) => setF({ ...f, arrDone: e.target.checked })} />
              Arrived successfully
            </label>
          </div>
        </div>

        <div className="pair-block dep-block">
          <div className="pair-title">Departure</div>
          <div className="grid3">
            <label className="fl">Date<input type="date" value={f.depDate} onChange={set("depDate")} /></label>
            <Time24 label="Time" value={f.depTime} onChange={(v) => setF({ ...f, depTime: v })} />
            <SelectOrOther label="Airport" value={f.depAirport} options={AIRPORTS}
              onChange={(v) => setF({ ...f, depAirport: v })} placeholder="Type airport…" />
          </div>
          <div className="grid2">
            <label className="fl">Outbound flight no.<input value={f.depFlight} onChange={set("depFlight")} placeholder="G9 358" /></label>
            <label className="fl">Flight status
              <select value={f.depStatus} onChange={set("depStatus")}>
                {FLIGHT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          {f.depStatus && f.depStatus !== "On schedule" && (
            <label className="fl">Changed by
              <select value={f.depChangeBy} onChange={set("depChangeBy")}>
                <option value="">— not recorded —</option>
                {CHANGE_SOURCES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
          )}
          <SelectOrOther label="Destination" value={f.depDest} options={DEP_DESTS}
            onChange={(v) => setF({ ...f, depDest: v })} placeholder="Type destination…" />
          {(() => {
            const s = suggestPickup(f, rules);
            const manual = toMin(f.depPickup) !== null;
            return (
              <div className="pickup-row">
                <Time24 label="Pick-up time" value={f.depPickup}
                  onChange={(v) => setF({ ...f, depPickup: v })} />
                <div className="pickup-help">
                  {s ? (
                    <>
                      <div>
                        Suggested <b>{s.time}</b>{s.dayOffset ? " the night before" : ""} — {s.checkIn} min at
                        the airport + {s.drive} min from {s.origin}
                        {s.svc ? ` ${s.svc > 0 ? "+" : "−"} ${Math.abs(s.svc)} min for ${serviceLabel(f.service)}` : ""} + {rules.buffer} min spare.
                      </div>
                      {!manual && <div className="pickup-note">Leave blank to keep using the suggestion — it follows any change to the flight time.</div>}
                      {manual && <button type="button" className="mini" onClick={() => setF({ ...f, depPickup: "" })}>Back to suggested</button>}
                      {!manual && <button type="button" className="mini" onClick={() => setF({ ...f, depPickup: s.time })}>Fix it at {s.time}</button>}
                      <label className="check-fl confirm-fl">
                        <input type="checkbox" checked={!!f.depPickupConfirmed}
                          onChange={(e) => setF({ ...f, depPickupConfirmed: e.target.checked ? { at: Date.now(), by: "" } : null })} />
                        Confirmed with the passenger
                      </label>
                      {f.depPickupConfirmed && f.depPickupConfirmed.by && (
                        <div className="pickup-note">Confirmed by {f.depPickupConfirmed.by}.</div>
                      )}
                    </>
                  ) : (
                    <div className="pickup-note">Set a departure date and time and a suggested pick-up appears here.</div>
                  )}
                </div>
              </div>
            );
          })()}
          <div className="grid3">
            <label className="fl">Drop-off driver<input value={f.depDriver} onChange={set("depDriver")} placeholder="Driver name" /></label>
            <label className="fl">Driver type
              <select value={f.depDriverType} onChange={set("depDriverType")}>
                <option value="">—</option>
                {DRIVER_TYPES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </label>
            <label className="check-fl">
              <input type="checkbox" checked={!!f.depDone} onChange={(e) => setF({ ...f, depDone: e.target.checked })} />
              Departed successfully
            </label>
          </div>
        </div>

        <div className="grid3">

          <label className="fl">Service
            <select value={f.service} onChange={set("service")}>
              <option value="">None</option>
              {SERVICE_OPTIONS.map((s) => <option key={s} value={s}>{serviceLabel(s)}</option>)}
            </select>
          </label>
        </div>

        <div className="grid3">
          <label className="fl">E-mail date<input type="date" value={f.emailDate} onChange={set("emailDate")} /></label>
          <SelectOrOther label="Received from" value={f.receivedFrom} options={RECEIVED_OPTIONS}
            onChange={(v) => setF({ ...f, receivedFrom: v })} placeholder="Type source…" />
          <label className="fl">Registered by
            <select value={REG_OPTIONS.includes(f.regBy) ? f.regBy : ""} onChange={set("regBy")}>
              <option value="">—</option>
              {REG_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
        </div>
        <label className="fl">Remarks<input value={f.remarks} onChange={set("remarks")} placeholder="no ticket submitted, updated 25-08…" /></label>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!ok} onClick={() => onSave(f)}>
            {record.id ? "Save changes" : "Add passenger"}
          </button>
        </div>
      </div>
    </div>
  );
}

function LogModal({ log, trash, isSuper, onRestore, onClose }) {
  const fmtTs = (ts) => new Date(ts).toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  });
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Activity</h2>

        {trash.length > 0 && (
          <>
            <div className="log-section">Recently deleted — can be restored</div>
            <ul className="log-list bin">
              {trash.map((t) => (
                <li key={t.id}>
                  <span className="log-main">
                    <b>{t.no} · {t.name}</b>
                    <span className="log-meta">deleted by {t.deletedBy} · {fmtTs(t.deletedAt)}</span>
                  </span>
                  {isSuper
                    ? <button className="mini" onClick={() => onRestore(t)}>Restore</button>
                    : <span className="log-meta">ask Admin to restore</span>}
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="log-section">History (latest 500 actions)</div>
        {log.length === 0 ? (
          <p className="modal-sub">No activity recorded yet. Every add, edit, delete, tick, restore and import will appear here with who did it and when.</p>
        ) : (
          <ul className="log-list">
            {log.map((e, i) => (
              <li key={e.ts + "-" + i}>
                <span className="log-main">
                  <b>{e.user}</b> {e.action}{e.no ? ` #${e.no}` : ""}{e.name ? ` — ${e.name}` : ""}
                  {e.details ? <span className="log-meta">{e.details}</span> : null}
                </span>
                <span className="log-time">{fmtTs(e.ts)}</span>
              </li>
            ))}
          </ul>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ================= access screens ================= */
function FlightCheckModal({ items, today, canEdit, onApply, onClose }) {
  const [results, setResults] = useState(() => items.map(() => ({ state: "pending" })));
  const [applied, setApplied] = useState({});
  const cancelled = useRef(false);

  useEffect(() => {
    cancelled.current = false;
    (async () => {
      for (let i = 0; i < items.length; i++) {
        if (cancelled.current) return;
        const it = items[i];
        const flightNo = legFlight(it.record, it.kind);
        if (!flightNo) {
          setResults((p) => p.map((r, j) => (j === i ? { state: "error", error: "No flight number on this record" } : r)));
          continue;
        }
        setResults((p) => p.map((r, j) => (j === i ? { state: "busy" } : r)));
        try {
          const data = await lookupFlight({
            flightNo,
            date: it.kind === "ARR" ? it.record.arrDate : it.record.depDate,
            kind: it.kind,
            airport: it.kind === "ARR" ? it.record.arrAirport : it.record.depAirport,
            today,
          });
          if (cancelled.current) return;
          setResults((p) => p.map((r, j) => (j === i ? { state: "done", data, flightNo } : r)));
        } catch (e) {
          if (cancelled.current) return;
          setResults((p) => p.map((r, j) => (j === i ? { state: "error", error: e.message } : r)));
        }
      }
    })();
    return () => { cancelled.current = true; };
  }, []);

  const busy = results.some((r) => r.state === "pending" || r.state === "busy");

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Flight check</h2>
        <p className="modal-sub">
          Searching Flightradar24, eia.krd and the airline pages for each flight. Nothing changes
          automatically — press Apply on a result to update the record.
        </p>

        <ul className="chk-list">
          {items.map((it, i) => {
            const r = results[i];
            const d = r.data;
            const newStatus = d ? CHECK_TO_STATUS[d.status] : null;
            const oldTime = it.kind === "ARR" ? it.record.arrTime : it.record.depTime;
            const changed = d && d.found && (
              (newStatus && newStatus !== (it.kind === "ARR" ? it.record.arrStatus : it.record.depStatus)) ||
              (d.actual && d.actual !== oldTime)
            );
            return (
              <li key={it.record.id + it.kind}>
                <div className="chk-head">
                  <span className={"b-kind " + (it.kind === "ARR" ? "arr" : "dep")}>{it.kind}</span>
                  <b>{it.record.name}</b>
                  <span className="chk-flight">{legFlight(it.record, it.kind) || "no flight no."}</span>
                  <span className="log-meta">
                    {fmtDate(it.kind === "ARR" ? it.record.arrDate : it.record.depDate)} · {oldTime || "—"}
                  </span>
                </div>

                {r.state === "pending" && <div className="chk-body log-meta">Waiting…</div>}
                {r.state === "busy" && <div className="chk-body log-meta">Searching…</div>}
                {r.state === "error" && <div className="chk-body chk-err">{r.error}</div>}
                {r.state === "done" && (
                  <div className="chk-body">
                    <div className={"chk-status " + (d.status === "Cancelled" ? "bad" : d.found ? "ok" : "unk")}>
                      {d.status}
                      {d.actual && d.actual !== d.scheduled ? ` · now ${d.actual}` : ""}
                      {typeof d.deltaMinutes === "number" && d.deltaMinutes ? ` (${d.deltaMinutes > 0 ? "+" : ""}${d.deltaMinutes} min)` : ""}
                    </div>
                    {d.note && <div className="chk-note">{d.note}</div>}
                    {d.source && <div className="log-meta">Source: {d.source}</div>}
                    {applied[i] ? (
                      <div className="import-ok">Applied.</div>
                    ) : changed && canEdit ? (
                      <button className="mini" onClick={() => { onApply(it, d, r.flightNo); setApplied((p) => ({ ...p, [i]: true })); }}>
                        Apply to record
                      </button>
                    ) : changed && !canEdit ? (
                      <div className="log-meta">Ask an Editor to apply this.</div>
                    ) : d.found ? (
                      <div className="log-meta">Matches the record — nothing to change.</div>
                    ) : null}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <p className="modal-sub chk-caveat">
          These results come from public flight pages, not an official airline feed, and live status
          usually only appears within about three days of departure. Always confirm anything critical
          with the travel agent before acting on it.
        </p>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>{busy ? "Stop and close" : "Close"}</button>
        </div>
      </div>
    </div>
  );
}

/* the flight number, airport and status for a single leg, inside that leg's cell */
function FlightCell({ no, airport, status, changeBy, check, show }) {
  if (!show) return null;
  return (
    <>
      <div className="leg-flight">{no || "no flight #"}{airport ? ` · ${airportShort(airport)}` : ""}</div>
      {status && status !== "On schedule" && (
        <div className={"fs-badge " + (status === "Cancelled" ? "fs-bad" : "fs-warn")}>
          {status}{changeBy ? ` · ${changeBy.toLowerCase()}` : ""}
        </div>
      )}
      {check && (
        <div className="driver" title={`${check.note || ""} ${check.source ? "— " + check.source : ""}`}>
          checked {fmtDate(new Date(check.at).toISOString().slice(0, 10))} by {check.by}
        </div>
      )}
    </>
  );
}

/* one line on the dashboard — an arrival, or a departure led by its pick-up time */
function MoveRow({ m }) {
  const isDep = m.kind === "DEP";
  const showPickup = isDep && m.pickup && !m.pickupWasYesterday;
  const showMeet = !isDep && m.meet;
  const lead = m.done ? "✓" : showPickup ? m.pickup : showMeet ? m.meet : m.time;
  const leadLabel = m.done ? (isDep ? "departed" : "arrived")
    : showPickup ? "pick up" : showMeet ? "be there" : isDep ? "departs" : "lands";

  return (
    <li className={"m-card" + (m.done ? " b-done" : "")}>
      <div className="m-when">
        <span className="b-time">{lead}</span>
        <span className="m-when-label">{leadLabel}</span>
      </div>

      <div className="m-body">
        <div className="m-top">
          <span className="b-name">{m.name}</span>
          {m.service && <span className="b-svc">{serviceLabel(m.service)}</span>}
          {m.fStatus && m.fStatus !== "On schedule" && (
            <span className="b-issue">{m.fStatus}{m.fBy ? ` · ${m.fBy.toLowerCase()}` : ""}</span>
          )}
          {showPickup && (m.pickupConfirmed
            ? <span className="b-ok">pick-up confirmed</span>
            : <span className="b-issue">pick-up not confirmed</span>)}
          {m.flightTomorrow && <span className="b-issue b-night">flight next day</span>}
          {m.pickupWasYesterday && <span className="b-issue b-night">collected night before</span>}
        </div>

        <div className="m-line">
          <span className="m-flight">{m.flight || "no flight no."}</span>
          {showPickup && <span className="m-sep">flight {m.time}</span>}
          {showMeet && <span className="m-sep">lands {m.time}</span>}
          {m.airport && <span className="m-sep">{airportShort(m.airport)}</span>}
        </div>

        {m.dest && <div className="m-route">{routeArrow(m.dest)}</div>}

        <div className={"m-driver" + (m.driver ? "" : " none")}>
          {m.driver ? `${m.driver}${m.driverType ? ` · ${m.driverType}` : ""}` : "no driver assigned"}
        </div>
      </div>
    </li>
  );
}

function RulesModal({ rules, onSave, onClose, records, onArchive }) {
  const [r, setR] = useState(() => JSON.parse(JSON.stringify(rules)));
  const num = (v) => (v === "" ? 0 : parseInt(v, 10) || 0);
  const setIn = (group, key, v) => setR({ ...r, [group]: { ...r[group], [key]: num(v) } });

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Rules &amp; settings</h2>
        <p className="modal-sub">
          All values are minutes. Change any of them and every suggested time in the app updates at once.
        </p>

        <div className="rules-sec">
          <div className="imp-src-head">Arrivals</div>
          <div className="pickup-note">
            The driver waits at the airport this long before the plane lands. The reminder appears
            that many minutes before the driver is due, for arrivals and departures alike.
          </div>
          <div className="rules-grid">
            <label className="fl">Remind us this early
              <input type="number" min="0" max="180" step="5" value={r.alertLead ?? 15}
                onChange={(e) => setR({ ...r, alertLead: num(e.target.value) })} />
            </label>
            <label className="fl">Driver there before landing
              <input type="number" min="0" step="5" value={r.arrLead ?? 15}
                onChange={(e) => setR({ ...r, arrLead: num(e.target.value) })} />
            </label>
          </div>
        </div>

        <div className="rules-sec">
          <div className="imp-src-head">Departures — time at the airport</div>
          <div className="pickup-note">
            How early the passenger has to be at the airport. Mardin and Shirnak include the road
            journey and the border crossing as well.
          </div>
          <div className="rules-grid">
            {AIRPORTS.map((a) => (
              <label key={a} className="fl">{airportShort(a)}
                <input type="number" min="0" step="15" value={r.checkIn[a] ?? 180}
                  onChange={(e) => setIn("checkIn", a, e.target.value)} />
              </label>
            ))}
          </div>
        </div>

        <div className="rules-sec">
          <div className="imp-src-head">Departures — drive time to the airport</div>
          <div className="pickup-note">From wherever the passenger is staying.</div>
          <div className="rules-grid">
            {LOCATIONS.map((l) => (
              <label key={l} className="fl">{l}
                <input type="number" min="0" step="5" value={r.drive[l] ?? r.driveDefault}
                  onChange={(e) => setIn("drive", l, e.target.value)} />
              </label>
            ))}
            <label className="fl">Anywhere else
              <input type="number" min="0" step="5" value={r.driveDefault}
                onChange={(e) => setR({ ...r, driveDefault: num(e.target.value) })} />
            </label>
          </div>
        </div>

        <div className="rules-sec">
          <div className="imp-src-head">Service at the airport</div>
          <div className="pickup-note">
            CIP is the quickest route to the aircraft, so it saves the most time. First Terminal
            still has to cross to the main terminal, so it saves less. Meet &amp; Greet takes a bus
            to First Terminal and on to the aircraft, so it needs <b>extra</b> time — enter a
            positive number for that one and a negative number for the two that save time.
          </div>
          <div className="rules-grid">
            {SERVICE_OPTIONS.map((sv) => (
              <label key={sv} className="fl">{serviceLabel(sv)}
                <input type="number" step="5" value={r.service[sv] ?? 0}
                  onChange={(e) => setIn("service", sv, e.target.value)} />
              </label>
            ))}
            <label className="fl">Spare time
              <input type="number" min="0" step="5" value={r.buffer}
                onChange={(e) => setR({ ...r, buffer: num(e.target.value) })} />
            </label>
            <label className="fl">Never less than
              <input type="number" min="0" step="5" value={r.minLead}
                onChange={(e) => setR({ ...r, minLead: num(e.target.value) })} />
            </label>
          </div>

        </div>

        <div className="rules-sec">
          <div className="imp-src-head">Older records</div>
          <div className="pickup-note">
            Records whose last movement is further back than this drop off the main screen. They are
            not deleted — a search reaches them, and there is a link at the bottom of the table to
            show them again.
          </div>
          <div className="rules-grid">
            <label className="fl">Hide after (months)
              <input type="number" min="1" max="60" step="1" value={r.archiveMonths ?? 6}
                onChange={(e) => setR({ ...r, archiveMonths: Math.max(1, num(e.target.value)) })} />
            </label>
          </div>
        </div>

        <div className="rules-sec">
          <div className="imp-src-head">Storage</div>
          {(() => {
            const st = storageEstimate(records);
            const full = st.pct >= 80;
            return (
              <>
                {!st.server && <div className="bar"><span style={{ width: `${st.pct}%` }} className={full ? "hot" : ""} /></div>}
                <div className="pickup-note">
                  {st.server
                    ? `${records.length} records, about ${st.mb.toFixed(2)} MB, held on the server. There is no storage limit here — archiving is now only about keeping the screen quick.`
                    : `${records.length} records using about ${st.mb.toFixed(2)} MB of the roughly 5 MB browser storage holds (${st.pct}%).` +
                      (full
                        ? " That is close to the limit. Export the oldest records and remove them, or new entries will stop saving."
                        : " Hiding old records keeps the screen quick but does not free space — only removing them does.")}
                </div>
                <button className="btn ghost" onClick={onArchive}>
                  Export records older than {r.archiveMonths ?? 6} months, then remove them
                </button>
              </>
            );
          })()}
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={() => setR(JSON.parse(JSON.stringify(DEFAULT_RULES)))}>Reset to defaults</button>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={() => { onSave(r); onClose(); }}>Save rules</button>
        </div>
      </div>
    </div>
  );
}

function SetupScreen({ onDone }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [made, setMade] = useState(null); // the new member, with its one-time code

  const problem = pin ? pinProblem(pin) : "";
  const emailOk = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const ok = name.trim().length > 1 && emailOk && pin && !problem;

  const go = async () => {
    setBusy(true);
    setMade(await makeMember(name.trim(), "Super admin", pin, email));
    setBusy(false);
  };

  if (made) {
    return (
      <div className="gate">
        <div className="gate-card">
          <h1>Keep this recovery code</h1>
          <p className="modal-sub">
            You are the Super admin, so there is nobody above you to reset your PIN. This code is
            the only way back in if you forget it. It is shown once and never again — the app keeps
            only a fingerprint of it, not the code itself.
          </p>
          <div className="rec-code">{made._code}</div>
          <div className="rec-actions">
            <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(made._code)}>Copy</button>
            <a className="btn ghost" href={`mailto:${encodeURIComponent(made.email)}?subject=${
              encodeURIComponent("Travel tracker recovery code")}&body=${
              encodeURIComponent(`Keep this somewhere safe.\n\nRecovery code: ${made._code}\nFor: ${made.name} (Super admin)`)}`}>
              Email it to myself
            </a>
          </div>
          <p className="pickup-note">
            Send it to your work address and keep it there. If you lose both the PIN and the code,
            the only way back is for another Super admin to reset you.
          </p>
          <button className="btn primary wide" onClick={() => onDone(made)}>I have saved it — continue</button>
        </div>
      </div>
    );
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <h1>Travel Logistics Tracker</h1>
        <p className="modal-sub">
          First-time setup. You'll be the <b>Super admin</b> — the only person who can manage
          people, change the rules, delete records or archive old ones. You can then add the
          Movcon team, who add and edit records, and Viewers, who only read.
        </p>
        <label className="fl">Your name<input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Idrees" autoFocus /></label>
        <label className="fl">Your work email<input value={email} type="email" onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" /></label>
        <label className="fl">Choose a PIN (4–6 digits)<input value={pin} inputMode="numeric" maxLength={6} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} placeholder="••••" /></label>
        {problem && <div className="import-bad">{problem}</div>}
        <button className="btn primary wide" disabled={!ok || busy} onClick={go}>
          {busy ? "Setting up…" : "Set up and start"}
        </button>
      </div>
    </div>
  );
}

function LoginScreen({ team, onLogin, onRecover }) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [tries, setTries] = useState(0);
  const [lockedUntil, setLockedUntil] = useState(0);
  const [mode, setMode] = useState("pin"); // pin | recover
  const [code, setCode] = useState("");
  const [newPin, setNewPin] = useState("");
  const [stage, setStage] = useState("code"); // code | newpin
  const locked = Date.now() < lockedUntil;

  const supers = team.members.filter((m) => m.role === "Super admin");
  const pick = (m) => { setSelected(m); setError(""); setMode("pin"); setStage("code"); setCode(""); setPin(""); };

  const tryLogin = async () => {
    if (!selected || locked) return;
    const hash = await hashPin(pin, selected.salt || "");
    if (hash === selected.hash) { setTries(0); onLogin(selected); return; }
    const n = tries + 1;
    setTries(n); setPin("");
    if (n >= 5) {
      setLockedUntil(Date.now() + 60000); setTries(0);
      setError("Too many wrong PINs. Wait a minute before trying again.");
    } else {
      setError(`Wrong PIN — ${5 - n} ${5 - n === 1 ? "try" : "tries"} left before a short lockout.`);
    }
  };

  const tryCode = async () => {
    if (!selected?.recHash) return;
    const h = await hashPin(cleanCode(code), selected.recSalt || "");
    if (h === selected.recHash) { setError(""); setStage("newpin"); }
    else setError("That recovery code doesn't match.");
  };

  const finishRecovery = async () => {
    const problem = pinProblem(newPin);
    if (problem) { setError(problem); return; }
    await onRecover(selected, newPin);
  };

  /* a Movcon or Viewer cannot reset themselves — they ask a Super admin */
  const askSuperAdmin = () => {
    const to = supers.map((m) => m.email).filter(Boolean).join(",");
    const subject = encodeURIComponent("Travel tracker — PIN reset needed");
    const body = encodeURIComponent(
      `Hello,\n\nI can't sign in to the Travel Logistics Tracker.\n\n` +
      `Name on the list: ${selected.name}\nRole: ${selected.role}\n\n` +
      `Please reset my PIN under Team access and send me the new one.\n\nThank you.`);
    return `mailto:${to}?subject=${subject}&body=${body}`;
  };

  return (
    <div className="gate">
      <div className="gate-card">
        <h1>Travel Logistics Tracker</h1>
        <p className="modal-sub">Choose your name and enter your PIN. If you're not on the list, ask the Super admin to add you under Team access.</p>
        <div className="member-grid">
          {team.members.map((m) => (
            <button key={m.name} className={"member" + (selected && selected.name === m.name ? " sel" : "")}
              onClick={() => pick(m)}>
              {m.name}<span className="member-role">{m.role}</span>
            </button>
          ))}
        </div>

        {selected && mode === "pin" && (
          <>
            <label className="fl">PIN for {selected.name}
              <input value={pin} inputMode="numeric" maxLength={6} autoFocus type="password"
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setError(""); }}
                onKeyDown={(e) => e.key === "Enter" && tryLogin()} placeholder="••••" />
            </label>
            {error && <div className="import-bad">{error}</div>}
            <button className="btn primary wide" disabled={!pin || locked} onClick={tryLogin}>
              {locked ? "Locked — wait a moment" : "Sign in"}
            </button>
            <button className="link-btn" onClick={() => { setMode("recover"); setError(""); }}>
              Forgotten your PIN?
            </button>
          </>
        )}

        {selected && mode === "recover" && (
          <div className="rec-panel">
            {selected.recHash ? (
              stage === "code" ? (
                <>
                  <div className="imp-src-head">Recovery code</div>
                  <p className="pickup-note">
                    Enter the code you saved when the account was set up — you most likely emailed it
                    to yourself. Using it lets you set a new PIN.
                  </p>
                  <input className="rec-input" value={code} autoFocus placeholder="XXXX-XXXX-XXXX-XXXX"
                    onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && tryCode()} />
                  {error && <div className="import-bad">{error}</div>}
                  <button className="btn primary wide" disabled={cleanCode(code).length < 8} onClick={tryCode}>
                    Check code
                  </button>
                </>
              ) : (
                <>
                  <div className="imp-src-head">Choose a new PIN</div>
                  <p className="pickup-note">
                    The old code stops working now. A fresh one is shown once you're in — save that too.
                  </p>
                  <input className="rec-input" value={newPin} inputMode="numeric" maxLength={6} autoFocus
                    type="password" placeholder="New PIN"
                    onChange={(e) => { setNewPin(e.target.value.replace(/\D/g, "")); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && finishRecovery()} />
                  {error && <div className="import-bad">{error}</div>}
                  <button className="btn primary wide" disabled={!newPin} onClick={finishRecovery}>
                    Set PIN and sign in
                  </button>
                </>
              )
            ) : (
              <>
                <div className="imp-src-head">Ask a Super admin</div>
                <p className="pickup-note">
                  {supers.length
                    ? `${supers.map((m) => m.name).join(" or ")} can reset your PIN under Team access.`
                    : "There is no Super admin on the list — nobody can reset this."}
                  {supers.some((m) => m.email)
                    ? " The button below opens your own mail app with the request written out; the app cannot send mail itself."
                    : " No email address is on file for them, so ask in person or by phone."}
                </p>
                {supers.some((m) => m.email) && (
                  <a className="btn primary wide" href={askSuperAdmin()}>Write the request</a>
                )}
              </>
            )}
            <button className="link-btn" onClick={() => { setMode("pin"); setError(""); }}>Back to sign in</button>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamModal({ team, meName, onSave, onClose }) {
  const [members, setMembers] = useState(team.members);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Movcon");
  const [pin, setPin] = useState("");
  const [note, setNote] = useState("");
  const [code, setCode] = useState(null); // a one-time code to hand over

  const problem = pin ? pinProblem(pin) : "";
  const duplicate = members.some((m) => m.name.toLowerCase() === name.trim().toLowerCase());
  const emailOk = !email.trim() || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const okNew = name.trim().length > 1 && pin && !problem && !duplicate && emailOk
    && (role !== "Super admin" || email.trim());
  const supers = members.filter((m) => m.role === "Super admin").length;

  const commit = (next) => { setMembers(next); onSave({ members: next }); };

  const add = async () => {
    const { _code, ...m } = await makeMember(name.trim(), role, pin, email);
    commit([...members, m]);
    setNote(`${name.trim()} added as ${role}. Give them the PIN privately — it is not shown again.`);
    if (_code) setCode({ name: m.name, email: m.email, code: _code });
    setName(""); setEmail(""); setPin("");
  };
  const remove = (n) => {
    const m = members.find((x) => x.name === n);
    if (m.role === "Super admin" && supers <= 1) { setNote("Add another Super admin before removing this one."); return; }
    if (!window.confirm(`Remove ${n}? They will not be able to sign in.`)) return;
    commit(members.filter((x) => x.name !== n));
    setNote(`${n} removed.`);
  };
  const setMemberRole = async (n, r) => {
    const m = members.find((x) => x.name === n);
    if (m.role === "Super admin" && r !== "Super admin" && supers <= 1) {
      setNote("There must always be at least one Super admin."); return;
    }
    if (r === "Super admin" && !m.email) {
      setNote(`Add an email address for ${n} first — a Super admin needs one for recovery.`); return;
    }
    if (r === "Super admin" && !m.recHash) {
      const { member: withCode, code: c } = await attachRecovery({ ...m, role: r });
      commit(members.map((x) => (x.name === n ? withCode : x)));
      setCode({ name: n, email: m.email, code: c });
      setNote(`${n} is now Super admin.`);
      return;
    }
    commit(members.map((x) => (x.name === n ? { ...x, role: r } : x)));
    setNote(`${n} is now ${r}.`);
  };

  const setEmailFor = (n, v) => commit(members.map((x) => (x.name === n ? { ...x, email: v } : x)));

  const newCodeFor = async (n) => {
    const m = members.find((x) => x.name === n);
    const { member: withCode, code: c } = await attachRecovery(m);
    commit(members.map((x) => (x.name === n ? withCode : x)));
    setCode({ name: n, email: m.email, code: c });
    setNote(`Previous recovery code for ${n} no longer works.`);
  };
  const resetPin = async (n) => {
    let p = "";
    do { p = String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, "0"); }
    while (pinProblem(p));
    const salt = newSalt();
    const hash = await hashPin(p, salt);
    commit(members.map((m) => (m.name === n ? { ...m, salt, hash } : m)));
    setNote(`New PIN for ${n}: ${p} — share it privately. It cannot be shown again.`);
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Team access</h2>
        <ul className="role-key">
          {ROLES.map((r) => <li key={r}><b>{r}</b> — {ROLE_HELP[r]}</li>)}
        </ul>

        <ul className="team-list">
          {members.map((m) => (
            <li key={m.name}>
              <span className="team-name">
                {m.name}{m.name === meName && " (you)"}
                <input className="team-email-in" value={m.email || ""} placeholder="email for recovery"
                  onChange={(e) => setEmailFor(m.name, e.target.value)} />
              </span>
              <select value={m.role} disabled={m.name === meName}
                onChange={(e) => setMemberRole(m.name, e.target.value)}>
                {ROLES.map((r) => <option key={r}>{r}</option>)}
              </select>
              <button className="mini" onClick={() => resetPin(m.name)}>Reset PIN</button>
              {m.role === "Super admin" && (
                <button className="mini" onClick={() => newCodeFor(m.name)}>New recovery code</button>
              )}
              {m.name !== meName && <button className="mini danger" onClick={() => remove(m.name)}>Remove</button>}
            </li>
          ))}
        </ul>

        <div className="add-member">
          <input value={name} onChange={(e) => { setName(e.target.value); setNote(""); }} placeholder="Colleague's name" />
          <input value={email} type="email" onChange={(e) => { setEmail(e.target.value); setNote(""); }}
            placeholder={role === "Super admin" ? "Work email (required)" : "Work email (optional)"} />
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
          <input value={pin} inputMode="numeric" maxLength={6} placeholder="PIN"
            onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setNote(""); }} />
          <button className="btn primary" disabled={!okNew} onClick={add}>Add</button>
        </div>
        {problem && <div className="import-bad">{problem}</div>}
        {duplicate && name.trim() && <div className="import-bad">Someone with that name is already on the list.</div>}
        {note && <div className="import-ok">{note}</div>}

        {code && (
          <div className="rec-panel">
            <div className="imp-src-head">Recovery code for {code.name}</div>
            <p className="pickup-note">
              Shown once. Send it to {code.email || "them"} so they can get back in if they forget
              their PIN — the app cannot send it for you.
            </p>
            <div className="rec-code">{code.code}</div>
            <div className="rec-actions">
              <button className="btn ghost" onClick={() => navigator.clipboard?.writeText(code.code)}>Copy</button>
              <a className="btn ghost" href={`mailto:${encodeURIComponent(code.email || "")}?subject=${
                encodeURIComponent("Travel tracker recovery code")}&body=${
                encodeURIComponent(`Keep this somewhere safe.\n\nRecovery code: ${code.code}\nFor: ${code.name} (Super admin)`)}`}>
                Email it
              </a>
              <button className="btn ghost" onClick={() => setCode(null)}>Done</button>
            </div>
          </div>
        )}

        <div className="security-note">
          <div className="imp-src-head">What this does and does not protect</div>
          <p>
            PINs are salted and hashed, so nobody can read them out of the stored data, and roles
            decide what each person can do in the app. Movcon and Viewers get their PIN reset here
            by a Super admin; a Super admin uses their own recovery code, since there is nobody
            above them.
          </p>
          <p>
            But this is <b>workflow permission, not enforced security</b>. Everything runs in the
            browser, and every person who can open this app shares one store of data. Someone
            technical who can open it could read all the records whatever their role, and could work
            around the buttons their role hides. Treat the app link itself as the real key: share it
            only inside the team, and don't put anything in here you would not put in a shared
            OneDrive folder the whole team can open.
          </p>
        </div>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

/* ================= access screen styles are in CSS below ================= */

/* ================= ticket scan modal ================= */
const SCAN_PROMPT = `You are reading a flight ticket / e-ticket / itinerary for a travel logistics office in Erbil, Kurdistan Region of Iraq. The local airports are Erbil (EIA/EBL), Mardin (MQM) and Shirnak/Sirnak (NKT).

Extract the details and respond with ONLY a JSON object, no markdown fences, no other text:
{
  "name": "passenger full name, normal capitalization",
  "arrDate": "YYYY-MM-DD or empty — the date the passenger LANDS at the local airport (journey INTO Erbil/Mardin/Shirnak). Use the arrival date at the final local airport.",
  "arrTime": "HH:MM 24h or empty — landing time at the local airport",
  "arrAirport": "Erbil (EIA) or Mardin or Shirnak, or empty",
  "depDate": "YYYY-MM-DD or empty — the date the passenger TAKES OFF from the local airport (journey OUT). Use the departure date/time from the local airport.",
  "depTime": "HH:MM 24h or empty",
  "depAirport": "Erbil (EIA) or Mardin or Shirnak, or empty",
  "arrFlight": "flight number of the leg that LANDS at the local airport, e.g. 'FZ 203', or empty",
  "depFlight": "flight number of the leg that TAKES OFF from the local airport, e.g. 'FZ 204', or empty"
}
A one-way ticket fills only the arrival OR the departure side. A return ticket fills both. If something is not on the ticket, use an empty string. Never guess a value that is not printed on the ticket.`;

/* shown after a scan when the passenger already has a record */
function TicketMatchModal({ fields, result, onUpdate, onCreate, onClose }) {
  const { all, confident, tripCount } = result;
  const [showAll, setShowAll] = useState(false);
  const [source, setSource] = useState("Airline");
  const [picked, setPicked] = useState(confident && !all[0].closed ? all[0].record.id : null);

  const openTrips = all.filter((c) => !c.closed);
  const doneTrips = all.filter((c) => c.closed);
  const shortlist = showAll ? all : openTrips.slice(0, 4);
  const hidden = all.length - shortlist.length;
  const chosen = all.find((c) => c.record.id === picked);

  const Row = ({ c }) => (
    <li className={(picked === c.record.id ? "on " : "") + (c.closed ? "closed" : "")}
      onClick={() => setPicked(c.record.id)}>
      <label>
        <input type="radio" checked={picked === c.record.id} onChange={() => setPicked(c.record.id)} />
        <div>
          <div className="match-head">
            <b>#{c.record.no}</b>
            <span className="match-when">
              {c.record.arrDate ? `in ${fmtDate(c.record.arrDate)}` : ""}
              {c.record.arrDate && c.record.depDate ? " · " : ""}
              {c.record.depDate ? `out ${fmtDate(c.record.depDate)}` : ""}
              {!c.record.arrDate && !c.record.depDate ? "no dates" : ""}
            </span>
            {c.record.depDest && <span className="log-meta">{routeArrow(c.record.depDest)}</span>}
            {c.closed && <span className="tag open-tag">already travelled</span>}
          </div>
          {c.why.length > 0 && <div className="match-why">Matches on: {c.why.join(", ")}</div>}
          {c.changes.length === 0 ? (
            <div className="log-meta">Nothing on this ticket differs from this record.</div>
          ) : (
            <ul className="diff">
              {c.changes.map((x) => (
                <li key={x.key}>
                  <span className="diff-label">{x.label}</span>
                  <span className="diff-from">{x.from}</span>
                  <span className="diff-arrow">→</span>
                  <span className="diff-to">{x.to}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </label>
    </li>
  );

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wide" onClick={(e) => e.stopPropagation()}>
        <h2>Which trip does this ticket replace?</h2>
        <p className="modal-sub">
          The ticket reads as <b>{fields.name || "an unnamed passenger"}</b>, who has {tripCount}{" "}
          {tripCount === 1 ? "record" : "records"} in the app
          {doneTrips.length ? ` (${doneTrips.length} already travelled)` : ""}. Pick the trip this
          ticket belongs to, or add it as a separate one.
        </p>
        {!confident && openTrips.length > 1 && (
          <div className="import-bad">
            More than one trip fits this ticket, so nothing is selected — check the dates below and choose.
          </div>
        )}

        <ul className="match-list">
          {shortlist.map((c) => <Row c={c} key={c.record.id} />)}
        </ul>
        {hidden > 0 && !showAll && (
          <button className="link-btn" onClick={() => setShowAll(true)}>
            Show {hidden} more {hidden === 1 ? "trip" : "trips"} for this passenger
            {doneTrips.length ? ", including ones already travelled" : ""}
          </button>
        )}

        <div className="src-pick">
          <span className="imp-src-head">Who changed it?</span>
          <div className="src-opts">
            {CHANGE_SOURCES.map((c) => (
              <button key={c} className={"chip" + (source === c ? " on" : "")}
                onClick={() => setSource(c)}>{c}</button>
            ))}
          </div>
          <div className="pickup-note">
            Recorded against whichever leg moved, so later you can tell an airline reschedule from
            one the office asked for.
          </div>
        </div>

        <p className="modal-sub">
          Updating opens the record with the new details filled in and marks any leg whose flight
          moved as Revised. Nothing is saved until you press Save there.
        </p>

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn ghost" onClick={onCreate}>Add as a new trip</button>
          <button className="btn primary" disabled={!chosen} onClick={() => onUpdate(chosen, source)}>
            {chosen ? `Update #${chosen.record.no}` : "Choose a trip"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TicketScanModal({ onClose, onResult }) {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef(null);

  const MEDIA = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

  const pick = (f) => {
    setError("");
    const ext = f.name.split(".").pop().toLowerCase();
    if (!MEDIA[ext]) {
      setError(ext === "pdf"
        ? "PDFs cannot be scanned. Open the ticket and photograph or screenshot it instead."
        : "Please choose a photo (JPG, PNG, WEBP).");
      return;
    }
    setFile(f);
  };

  const scan = async () => {
    if (!file) return;
    setBusy(true); setError("");
    try {
      const sample = await getSample();
      if (!sample) {
        throw new Error(
          "Ticket scanning is not available here. Enter the details by hand."
        );
      }

      /* The host states what it will accept, so a file it cannot read is
         refused with a reason rather than sent and rejected. */
      const limits = await sample.limits().catch(() => null);
      const kinds = limits && limits.images && limits.images.mediaTypes;
      if (kinds && kinds.length && !kinds.includes(file.type)) {
        throw new Error(
          file.type === "application/pdf"
            ? "PDFs cannot be scanned. Open the ticket and photograph or screenshot it instead."
            : `That file type cannot be scanned. Use ${kinds.join(", ")}.`
        );
      }
      const maxBytes = limits && limits.images && limits.images.maxInputBytes;
      if (maxBytes && file.size > maxBytes) {
        throw new Error(
          `That file is ${(file.size / 1048576).toFixed(1)} MB, over the ${(maxBytes / 1048576).toFixed(0)} MB limit. Photograph it at a lower resolution.`
        );
      }

      /* The image goes as-is — no base64, the host handles the encoding. */
      const j = await sample.json(SCAN_PROMPT, { images: file });

      const fields = {};
      if (j.name) fields.name = j.name;
      if (j.arrFlight) fields.arrFlight = j.arrFlight;
      if (j.depFlight) fields.depFlight = j.depFlight;
      if (j.arrDate) fields.arrDate = j.arrDate;
      if (j.arrTime) fields.arrTime = j.arrTime;
      if (j.arrAirport) fields.arrAirport = j.arrAirport;
      if (j.depDate) fields.depDate = j.depDate;
      if (j.depTime) fields.depTime = j.depTime;
      if (j.depAirport) fields.depAirport = j.depAirport;
      if (!Object.keys(fields).length) throw new Error("No ticket details found — try a clearer photo or the PDF.");
      onResult(fields);
    } catch (e) {
      setError(sampleError(e) || "Scanning failed — please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay" onClick={busy ? undefined : onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Scan a flight ticket</h2>
        <p className="modal-sub">
          Attach the e-ticket PDF or a clear photo of the ticket. The name, dates, times, airport and
          flight numbers are read automatically. If the passenger already has a record, the app asks
          whether this ticket replaces it before anything is changed.
        </p>
        <div
          className={"drop" + (file ? " has-file" : "")}
          onClick={() => fileRef.current.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); e.dataTransfer.files[0] && pick(e.dataTransfer.files[0]); }}
        >
          {file ? <span>📄 {file.name}</span> : <span>Tap to choose a PDF or photo — or drop it here</span>}
        </div>
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" style={{ display: "none" }}
          onChange={(e) => e.target.files[0] && pick(e.target.files[0])} />
        {error && <div className="import-bad">{error}</div>}
        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" onClick={scan} disabled={!file || busy}>
            {busy ? "Reading ticket…" : "Read ticket"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================= import modal ================= */
function ImportModal({ onImport, onImportBuiltIn, onClose, isSuper, existingCount }) {
  const [text, setText] = useState("");
  const [mode, setMode] = useState("add");
  const [confirming, setConfirming] = useState(null); // "builtin" | "csv"
  const [showCsv, setShowCsv] = useState(false);
  const [done, setDone] = useState(null);
  const fileRef = useRef(null);

  const readFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result));
    reader.readAsText(file);
  };

  const run = (source) => {
    if (mode === "replace" && confirming !== source) { setConfirming(source); return; }
    const res = source === "builtin" ? onImportBuiltIn(mode) : onImport(text, mode);
    setDone(res);
    setConfirming(null);
    if (res.added > 0) setTimeout(onClose, 1600);
  };

  const danger = mode === "replace";

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Load records</h2>

        {isSuper && (
          <div className="imp-mode">
            <label className={mode === "add" ? "on" : ""}>
              <input type="radio" checked={mode === "add"} onChange={() => { setMode("add"); setConfirming(null); }} />
              <span><b>Add to existing</b><small>Keeps the {existingCount} record{existingCount === 1 ? "" : "s"} already here. Anything with a No. that already exists is skipped, so nothing is duplicated.</small></span>
            </label>
            <label className={mode === "replace" ? "on" : ""}>
              <input type="radio" checked={mode === "replace"} onChange={() => { setMode("replace"); setConfirming(null); }} />
              <span><b>Replace everything (go-live)</b><small>Clears all {existingCount} current record{existingCount === 1 ? "" : "s"} first. Use this once, on the day you switch over.</small></span>
            </label>
          </div>
        )}

        <div className="imp-source">
          <div className="imp-src-head">Master Sheet data — built in</div>
          <p className="modal-sub">
            {MASTER_COUNT} records carried over from the Master Sheet: every movement from 1 July 2026
            onward, with routes, airports, flight status and FT/CIP already cleaned up. Nothing to
            download or upload — it is inside the app.
          </p>
          {confirming === "builtin" && (
            <div className="import-bad">
              This deletes all {existingCount} record{existingCount === 1 ? "" : "s"} currently in the app, and they
              do <b>not</b> go to the recycle bin. Press again to confirm.
            </div>
          )}
          <button className={"btn " + (danger ? "danger" : "primary")} onClick={() => run("builtin")}>
            {danger
              ? (confirming === "builtin" ? `Yes, replace with the ${MASTER_COUNT} records` : `Replace everything with the Master Sheet data`)
              : `Load ${MASTER_COUNT} records`}
          </button>
        </div>

        {!showCsv ? (
          <button className="link-btn" onClick={() => setShowCsv(true)}>Or load a CSV file instead</button>
        ) : (
          <div className="imp-source">
            <div className="imp-src-head">From a CSV file</div>
            <p className="modal-sub">
              Columns are matched by name — No., Name, Arrival, Time, Destination, Departure,
              E-Mail date, Received From, Arr. Flight, Dep. Flight, Reg by, Remarks.
            </p>
            <button className="btn ghost" onClick={() => fileRef.current.click()}>Choose CSV file</button>
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }}
              onChange={(e) => e.target.files[0] && readFile(e.target.files[0])} />
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setConfirming(null); }}
              placeholder={"Or paste rows here…\nNo.,Name,Arrival,Time,Destination,Departure,Time,Destination,E-Mail date,Received From,Arr. Flight,Dep. Flight,Reg by,Remarks"}
            />
            {confirming === "csv" && (
              <div className="import-bad">
                This deletes all {existingCount} record{existingCount === 1 ? "" : "s"} currently in the app. Press again to confirm.
              </div>
            )}
            <button className={"btn " + (danger ? "danger" : "primary")}
              disabled={!text.trim()} onClick={() => run("csv")}>
              {danger ? (confirming === "csv" ? "Yes, replace everything" : "Replace all records") : "Import records"}
            </button>
          </div>
        )}

        {done !== null && (
          <div className={done.added > 0 ? "import-ok" : "import-bad"}>
            {done.added > 0
              ? `Loaded ${done.added} record${done.added === 1 ? "" : "s"}.` +
                (done.removed ? ` Removed ${done.removed} previous record${done.removed === 1 ? "" : "s"}.` : "") +
                (done.skipped ? ` Skipped ${done.skipped} already in the app.` : "")
              : done.skipped
                ? `Nothing loaded — all ${done.skipped} records are already in the app.`
                : "No rows found — check that the header row is included."}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ================= styles ================= */
const CSS = `
.store-error{position:sticky;top:0;z-index:60;display:flex;align-items:center;gap:10px;
  flex-wrap:wrap;padding:10px 14px;background:#b3261e;color:#fff;font-size:14px;
  box-shadow:0 1px 4px rgba(0,0,0,.25)}
.store-error strong{font-weight:600}
.store-error .btn{margin-left:auto;border-color:rgba(255,255,255,.55);color:#fff}
.store-error .btn+.btn{margin-left:0}
.btn.sm{padding:4px 10px;font-size:13px}

@import url('https://fonts.googleapis.com/css2?family=Barlow:wght@400;500;600;700&family=Barlow+Condensed:wght@500;600;700&display=swap');

.tlt {
  --paper:#F1F3F2; --panel:#FFFFFF; --ink:#1C2733; --dim:#5D6B78; --line:#DCE1E4;
  --board:#141C26; --board-line:#26313E; --board-text:#E9EEF3; --hl:#F5B942;
  --arr:#1C7A52; --arr-bg:#E7F3EC; --dep:#B4551D; --dep-bg:#FBEEE1;
  --danger:#B3372E;
  font-family:'Barlow',system-ui,sans-serif; color:var(--ink);
  background:var(--paper); min-height:100vh; padding:0 0 48px;
}
.tlt * { box-sizing:border-box; }

/* The app had never set a colour or a background on its own root, so it
   inherited both from whatever page hosted it. On a host with a dark theme that
   makes the inherited text near-white, and anything that does not set its own
   colour disappears against the app's white panels — .mini paints itself white,
   so Edit / Confirm pick-up / Check went invisible while .mini.danger and
   .mini.on, which do set a colour, stayed readable.

   The palette here is committed to light, so the root now says so explicitly
   rather than borrowing from its host. */
.tlt { color: var(--ink); background: var(--paper); }

/* color-scheme keeps the controls the browser paints for itself — date and time
   pickers, dropdown menus, scrollbars — in the same light world as the palette
   above, instead of following the device theme. */
.tlt { color-scheme: light; }


.loading { padding:60px; text-align:center; color:var(--dim); }

/* ---- board ---- */
.board { background:var(--board); color:var(--board-text); padding:22px 24px 18px; }
.board-top { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
.board h1 { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:30px; letter-spacing:.4px; margin:0; line-height:1; }
.board-date { color:#8FA0B0; font-size:13px; margin-top:4px; }
.tallies { display:flex; gap:22px; }
.tally { display:flex; flex-direction:column; align-items:flex-end; font-size:12px; color:#8FA0B0; }
.tally-n { font-family:'Barlow Condensed',sans-serif; font-size:30px; font-weight:600; line-height:1; color:var(--board-text); }
.tally-n.hl { color:var(--hl); }
.tally-n.warn { color:#E8896B; }
.dash { display:grid; gap:22px; margin-top:4px; }
.dash-head { display:flex; align-items:baseline; gap:10px; padding-bottom:6px; }
.dash-head b { font-family:'Barlow Condensed',sans-serif; text-transform:uppercase; letter-spacing:.06em;
  font-size:17px; color:#fff; }
.dash-head span { color:#8FA0B0; font-size:13px; }
.dash-sub { font-family:'Barlow Condensed',sans-serif; text-transform:uppercase; letter-spacing:.07em;
  font-size:12.5px; font-weight:700; padding:10px 2px 2px; }
.dash-sub.arr { color:#6FD3A6; }
.dash-sub.dep { color:#F0A183; }
.board-empty { border-top:1px solid var(--board-line); padding:12px 2px 2px; color:#75838F; font-size:13.5px; }
.board-list { list-style:none; margin:0; padding:0; }
.m-card { display:grid; grid-template-columns:66px 1fr; gap:0 14px; padding:11px 0 12px;
  border-top:1px solid var(--board-line); }
.m-card:first-child { border-top:none; }
.m-when { text-align:right; }
.b-time { display:block; font-family:'Barlow Condensed',sans-serif; font-size:21px; font-weight:600;
  color:var(--hl); font-variant-numeric:tabular-nums; line-height:1.15; }
.m-when-label { font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; color:#75838F; }
.m-top { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
.b-name { font-weight:600; font-size:14.5px; color:#fff; }
.b-svc { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
  padding:2px 7px; border-radius:3px; background:rgba(233,196,106,.16); color:var(--hl); }
.b-issue { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
  padding:2px 7px; border-radius:3px; background:rgba(232,137,107,.18); color:#F0A183; }
.b-issue.b-night { background:#3D4B5B; color:#DCE4EC; }
.m-line { margin-top:3px; font-size:12.5px; color:#8FA0B0; }
.m-flight { font-family:ui-monospace,Menlo,monospace; color:#B9C4CE; }
.m-sep::before { content:"·"; margin:0 6px; color:#4A5765; }
.m-route { margin-top:2px; font-size:13px; color:#DCE4EC; }
.m-driver { margin-top:3px; font-size:12.5px; color:#8FA0B0; }
.m-driver::before { content:"🚗"; margin-right:5px; }
.m-driver.none { color:#8A7A5C; font-style:italic; }
.b-done { opacity:.5; }
.b-done .b-time { color:#6FD3A6; }
.dash-controls { display:flex; align-items:center; gap:6px; padding:2px 0 12px; }
.dash-ctl-label { font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:#75838F; margin-right:2px; }
.chip.dark { border-color:var(--board-line); background:transparent; color:#B9C4CE; font-size:12px; padding:4px 11px; }
.chip.dark.on { background:var(--hl); border-color:var(--hl); color:#3D2E05; font-weight:600; }
.dash-day.past { opacity:.72; }
.dash-day.past .dash-head b { color:#B9C4CE; }
.day-tick { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
  padding:2px 7px; border-radius:3px; background:rgba(232,137,107,.18); color:#F0A183; }
.day-tick.all { background:rgba(46,160,110,.18); color:#6FD3A6; }
@media (min-width:1100px){
  .dash { grid-template-columns:repeat(3,1fr); gap:26px; align-items:start; }
}

/* ---- toolbar ---- */
.toolbar { display:flex; flex-wrap:wrap; gap:10px; align-items:center; padding:16px 24px 6px; }
.search { flex:1 1 240px; min-width:200px; padding:9px 12px; border:1px solid var(--line); border-radius:6px; font:inherit; font-size:14px; background:var(--panel); }
.search:focus { outline:2px solid var(--ink); outline-offset:1px; }
.chips { display:flex; gap:6px; flex-wrap:wrap; }
.chip { border:1px solid var(--line); background:var(--panel); border-radius:99px; padding:6px 13px; font:inherit; font-size:13px; cursor:pointer; color:var(--dim); }
.chip.on { background:var(--ink); border-color:var(--ink); color:#fff; }
.tools { display:flex; gap:8px; margin-left:auto; flex-wrap:wrap; }
.btn { font:inherit; font-size:14px; font-weight:600; padding:9px 15px; border-radius:6px; cursor:pointer; border:1px solid transparent; }
.btn.primary { background:var(--ink); color:#fff; }
.btn.primary:disabled { opacity:.4; cursor:default; }
.btn.ghost { background:var(--panel); border-color:var(--line); color:var(--ink); }
.btn.danger { background:var(--danger); color:#fff; }
.btn:focus-visible, .chip:focus-visible, .mini:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }

/* ---- table ---- */
.table-wrap { margin:12px 24px 0; background:var(--panel); border:1px solid var(--line); border-radius:8px; overflow-x:auto; }
table { border-collapse:collapse; width:100%; min-width:1080px; font-size:13.5px; }
th { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:14.5px; letter-spacing:.3px; text-align:left; padding:10px 12px; border-bottom:2px solid var(--ink); white-space:nowrap; }
.th-arr { color:var(--arr); } .th-dep { color:var(--dep); }
td { padding:9px 12px; border-bottom:1px solid var(--line); vertical-align:top; }
tbody tr:last-child td { border-bottom:none; }
tbody tr:hover td { background:#F7F9F8; }
.row-today td { background:#FDF7E9; }
.row-today:hover td { background:#FBF2DC; }
.mono { font-variant-numeric:tabular-nums; white-space:nowrap; }
.dim { color:var(--dim); }
.name-cell { font-weight:600; min-width:180px; }
.cell-arr { background:var(--arr-bg); }
.cell-dep { background:var(--dep-bg); }
.row-today .cell-arr, .row-today .cell-dep { background:transparent; }
.remarks { color:var(--danger); font-weight:500; max-width:220px; }
.tag { font-size:10.5px; font-weight:700; padding:1px 6px; border-radius:3px; margin-left:7px; vertical-align:1px; }
.today-tag { background:var(--hl); color:#3D2E05; }
.open-tag { background:#F4DAD3; color:var(--danger); }
.svc-tag { background:#E2E9F5; color:#2B4A78; }
.emp-tag { background:#E3EFE8; color:#1C5C40; }
.ctr-tag { background:#EFE7F3; color:#5B3A78; }
.fs-badge { display:inline-block; font-size:10.5px; font-weight:700; padding:1px 6px; border-radius:3px; margin-top:3px; }
.fs-warn { background:#FCEBC8; color:#8A5B00; }
.fs-bad { background:#F4D3D0; color:var(--danger); }
.b-kind { font-size:11px; font-weight:700; padding:2px 7px; border-radius:3px; letter-spacing:.04em; }
.b-kind.arr { background:var(--arr-bg); color:var(--arr); }
.b-kind.dep { background:var(--dep-bg); color:var(--dep); }
.tick { font-size:12px; font-weight:800; width:20px; height:20px; line-height:1; border-radius:50%; border:1.5px solid #9DB4A8; background:#fff; color:#B9C7BF; cursor:pointer; margin-right:7px; padding:0; vertical-align:-2px; }
.tick.done { background:var(--arr); border-color:var(--arr); color:#fff; }
.tick:focus-visible { outline:2px solid var(--ink); outline-offset:2px; }
.cell-dep .tick.done { background:var(--dep); border-color:var(--dep); }
.driver { font-size:12px; color:var(--dim); margin-top:3px; white-space:nowrap; }
.check-fl { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:600; color:var(--ink); margin-bottom:12px; align-self:end; padding-bottom:9px; cursor:pointer; }
.check-fl input { width:17px; height:17px; accent-color:var(--arr); cursor:pointer; }
.dep-block .check-fl input { accent-color:var(--dep); }
.sort-select { font:inherit; font-size:13.5px; padding:8px 10px; border:1px solid var(--line); border-radius:6px; background:var(--panel); color:var(--ink); cursor:pointer; }
.sort-select:focus-visible { outline:2px solid var(--ink); outline-offset:1px; }
.scan-btn { border-color:var(--ink); }
.drop { border:2px dashed var(--line); border-radius:8px; padding:26px 14px; text-align:center; color:var(--dim); font-size:14px; cursor:pointer; margin-top:4px; }
.drop:hover { border-color:var(--ink); color:var(--ink); }
.drop.has-file { border-style:solid; border-color:var(--arr); color:var(--ink); font-weight:600; background:var(--arr-bg); }
.fl input.bad-time { border-color:var(--danger); outline-color:var(--danger); }
.time-hint { font-weight:500; font-size:11.5px; color:var(--danger); margin-top:2px; }

/* ---- access ---- */
.gate { min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
.gate-card { background:var(--panel); border:1px solid var(--line); border-radius:12px; padding:28px 26px; width:100%; max-width:440px; }
.gate-card h1 { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:28px; margin:0 0 8px; }
.btn.wide { width:100%; margin-top:4px; }
.member-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:14px; }
.member { font:inherit; text-align:left; padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:#fff; cursor:pointer; font-weight:600; display:flex; flex-direction:column; gap:2px; }
.member .member-role { font-size:11.5px; font-weight:500; color:var(--dim); }
.role-key { list-style:none; margin:0 0 14px; padding:10px 12px; border:1px solid var(--line);
  border-radius:8px; font-size:13px; line-height:1.6; color:var(--dim); }
.role-key b { color:var(--ink); }
.rec-code { font-family:ui-monospace,Menlo,monospace; font-size:21px; font-weight:700; letter-spacing:.08em;
  text-align:center; padding:14px 10px; margin:12px 0; border:2px dashed var(--ink); border-radius:8px;
  background:var(--panel); word-break:break-all; }
.rec-actions { display:flex; gap:8px; margin-bottom:10px; }
.rec-actions .btn { flex:1; text-align:center; text-decoration:none; line-height:1.4; }
.rec-panel { border-top:1px solid var(--line); margin-top:14px; padding-top:12px; }
.rec-input { width:100%; font:inherit; font-size:15px; font-family:ui-monospace,Menlo,monospace;
  letter-spacing:.06em; text-align:center; padding:10px; border:1px solid var(--line); border-radius:6px;
  margin:8px 0 10px; }
.team-email-in { display:block; width:100%; margin-top:3px; font:inherit; font-size:11.5px;
  padding:3px 6px; border:1px solid var(--line); border-radius:4px; color:var(--dim); background:transparent; }
.add-member input[type=email] { min-width:150px; }
.security-note { margin-top:16px; border-top:1px solid var(--line); padding-top:12px; }
.security-note p { font-size:12.5px; line-height:1.6; color:var(--dim); margin:6px 0 0; }
.security-note b { color:var(--ink); }
.member.sel { border-color:var(--ink); outline:2px solid var(--ink); }
.who { display:flex; align-items:center; gap:10px; font-size:12.5px; color:#8FA0B0; margin:-6px 0 12px; flex-wrap:wrap; }
.who b { color:var(--board-text); font-weight:600; }
.who-btn { font:inherit; font-size:12px; padding:3px 10px; border-radius:99px; border:1px solid var(--board-line); background:transparent; color:#B9C4CE; cursor:pointer; }
.who-btn:hover { color:#fff; border-color:#3D4B5B; }
.team-list { list-style:none; margin:0 0 14px; padding:0; }
.team-list li { display:flex; align-items:center; gap:8px; padding:8px 0; border-bottom:1px solid var(--line); flex-wrap:wrap; }
.team-name { font-weight:600; flex:1 1 120px; }
.team-list select { font:inherit; font-size:13px; padding:5px 8px; border:1px solid var(--line); border-radius:6px; background:#fff; }
.add-member { display:grid; grid-template-columns:1.4fr 1fr .8fr auto; gap:8px; align-items:center; }
.add-member input, .add-member select { font:inherit; font-size:13.5px; padding:8px 10px; border:1px solid var(--line); border-radius:6px; background:#fff; min-width:0; }
@media (max-width:560px){ .add-member { grid-template-columns:1fr 1fr; } }
.tick:disabled { cursor:default; opacity:.7; }
.log-section { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:16px; margin:12px 0 6px; }
.log-list { list-style:none; margin:0 0 8px; padding:0; max-height:300px; overflow-y:auto; }
.log-list li { display:flex; justify-content:space-between; align-items:flex-start; gap:10px; padding:7px 0; border-bottom:1px solid var(--line); font-size:13.5px; }
.log-list.bin { max-height:180px; background:var(--dep-bg); border-radius:6px; padding:4px 10px; }
.log-main { display:flex; flex-direction:column; gap:1px; }
.log-meta { font-size:11.5px; color:var(--dim); }
.log-time { font-size:11.5px; color:var(--dim); white-space:nowrap; }
.row-actions { white-space:nowrap; }
.mini { font:inherit; font-size:12px; padding:4px 9px; border:1px solid var(--line); background:#fff; color:var(--ink); border-radius:5px; cursor:pointer; margin-left:4px; }
.mini.danger { color:var(--danger); }
.empty-row { text-align:center; color:var(--dim); padding:28px; }
.foot { padding:10px 26px; font-size:12.5px; color:var(--dim); }

/* ---- modals ---- */
.overlay { position:fixed; inset:0; background:rgba(20,28,38,.55); display:flex; align-items:flex-start; justify-content:center; padding:24px 14px; overflow-y:auto; z-index:20; }
.modal { background:var(--panel); border-radius:10px; padding:22px; width:100%; max-width:640px; margin:auto 0; }
.modal.small { max-width:400px; }
.modal h2 { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:24px; margin:0 0 10px; }
.modal-sub { color:var(--dim); font-size:13.5px; margin:0 0 14px; line-height:1.5; }
.fl { display:flex; flex-direction:column; gap:4px; font-size:12.5px; font-weight:600; color:var(--dim); margin-bottom:12px; }
.fl input, .fl select { font:inherit; font-size:14px; font-weight:400; color:var(--ink); padding:8px 10px; border:1px solid var(--line); border-radius:6px; background:#fff; width:100%; }
.fl input:focus, .fl select:focus { outline:2px solid var(--ink); outline-offset:1px; }
.fl input + input, .fl select + input { margin-top:6px; }
.grid3 { display:grid; grid-template-columns:1fr 1fr 1.4fr; gap:10px; }
.grid2 { display:grid; grid-template-columns:1fr 1.4fr; gap:10px; }
@media (max-width:560px){ .grid3, .grid2 { grid-template-columns:1fr; } }
.pair-block { border:1px solid var(--line); border-left-width:4px; border-radius:6px; padding:12px 12px 0; margin-bottom:14px; }
.arr-block { border-left-color:var(--arr); background:var(--arr-bg); }
.dep-block { border-left-color:var(--dep); background:var(--dep-bg); }
.pair-title { font-family:'Barlow Condensed',sans-serif; font-weight:600; font-size:16px; margin-bottom:8px; }
.arr-block .pair-title { color:var(--arr); } .dep-block .pair-title { color:var(--dep); }
.modal-actions { display:flex; justify-content:flex-end; gap:10px; margin-top:8px; }
.modal textarea { width:100%; height:130px; font:13px/1.5 ui-monospace,monospace; border:1px solid var(--line); border-radius:6px; padding:10px; margin-top:12px; resize:vertical; }
.leg-flight { font-family:ui-monospace,Menlo,monospace; font-size:11.5px; color:var(--dim); margin-top:2px; }
.pickup { font-size:11.5px; color:var(--dep); font-weight:700; margin-top:2px; }
.pickup.manual { text-decoration:underline dotted; }
.pickup.meet { color:var(--arr); }
.pk-ok { margin-left:6px; font-weight:600; color:var(--arr); }
.pk-no { margin-left:6px; font-weight:600; color:#8A5B00; }
.mini.on { border-color:var(--arr); color:var(--arr); }
.confirm-fl { margin:8px 0 0; padding:0; align-self:start; }
.b-ok { font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.05em;
  padding:2px 7px; border-radius:3px; background:rgba(46,160,110,.18); color:#6FD3A6; }
.pickup-row { display:grid; grid-template-columns:150px 1fr; gap:12px; align-items:start; margin-top:10px;
  padding:10px 12px; border:1px solid var(--line); border-radius:8px; background:var(--dep-bg); }
.pickup-help { font-size:12.5px; line-height:1.5; }
.pickup-help .mini { margin-top:6px; }
.pickup-note { color:var(--dim); font-size:12px; margin-top:4px; line-height:1.45; }
.rules-sec { margin-bottom:16px; }
.rules-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:8px; margin:6px 0 4px; }
.rules-grid input { width:100%; }
.bar { height:8px; border-radius:99px; background:var(--line); overflow:hidden; margin:8px 0 6px; }
.bar span { display:block; height:100%; background:var(--arr); }
.bar span.hot { background:var(--danger); }
.b-night { background:#3D4B5B; color:#DCE4EC; }
.match-list { list-style:none; margin:0 0 4px; padding:0; max-height:44vh; overflow:auto; }
.match-list li { border:1px solid var(--line); border-radius:8px; margin-bottom:8px; cursor:pointer; }
.match-list li.on { border-color:var(--ink); box-shadow:inset 0 0 0 1px var(--ink); }
.match-list label { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; cursor:pointer; }
.match-list input { margin-top:4px; }
.match-head { display:flex; flex-wrap:wrap; gap:8px; align-items:baseline; font-size:14px; }
.match-when { font-variant-numeric:tabular-nums; font-weight:600; }
.src-pick { border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin:12px 0; }
.src-opts { display:flex; flex-wrap:wrap; gap:6px; margin:6px 0 2px; }
.match-why { font-size:12px; color:var(--arr); margin-top:2px; }
.match-list li.closed { opacity:.62; background:#F5F6F7; }
.diff { list-style:none; margin:6px 0 0; padding:0; font-size:12.5px; }
.diff li { display:flex; flex-wrap:wrap; gap:6px; align-items:baseline; padding:1px 0; }
.diff-label { color:var(--dim); min-width:104px; }
.diff-from { color:var(--dim); text-decoration:line-through; }
.diff-arrow { color:var(--dim); }
.diff-to { font-weight:700; color:var(--dep); }
.chk-list { list-style:none; margin:0 0 14px; padding:0; max-height:46vh; overflow:auto; }
.chk-list li { border:1px solid var(--line); border-radius:8px; padding:10px 12px; margin-bottom:8px; }
.chk-head { display:flex; align-items:center; gap:8px; flex-wrap:wrap; font-size:14px; }
.chk-flight { font-family:ui-monospace,Menlo,monospace; font-size:12.5px; color:var(--dim); }
.chk-body { margin-top:6px; font-size:13.5px; }
.chk-status { font-weight:700; font-size:14px; }
.chk-status.ok { color:var(--arr); }
.chk-status.bad { color:var(--danger); }
.chk-status.unk { color:var(--dim); }
.chk-note { color:var(--ink); margin:2px 0 4px; line-height:1.45; }
.chk-err { color:var(--danger); }
.chk-caveat { border-top:1px solid var(--line); padding-top:10px; }
.hl-btn { color:var(--hl); border-color:var(--hl); }
.modal.wide { max-width:640px; }
.imp-source { border:1px solid var(--line); border-radius:8px; padding:12px 14px; margin-bottom:12px; }
.imp-src-head { font-family:'Barlow Condensed',sans-serif; text-transform:uppercase; letter-spacing:.06em;
  font-weight:700; font-size:13px; color:var(--dim); margin-bottom:4px; }
.imp-source .modal-sub { margin:0 0 10px; }
.link-btn { background:none; border:none; padding:0 0 12px; color:var(--dim); font-family:inherit;
  font-size:13.5px; text-decoration:underline; cursor:pointer; }
.link-btn:hover { color:var(--ink); }
.link-btn.inline { padding:0; font-size:inherit; }
.alerts { margin:0 24px 14px; border:1px solid var(--dep); border-left:4px solid var(--dep);
  border-radius:8px; background:var(--dep-bg); padding:10px 14px 6px; }
.alerts-head { display:flex; align-items:center; justify-content:space-between; gap:10px;
  font-family:'Barlow Condensed',sans-serif; text-transform:uppercase; letter-spacing:.06em;
  font-size:14px; color:var(--dep); padding-bottom:4px; }
.alerts-head .who-btn { color:var(--dep); border-color:var(--dep); }
.alerts ul { list-style:none; margin:0; padding:0; }
.alerts li { display:flex; flex-wrap:wrap; gap:10px; align-items:center; padding:7px 0;
  border-top:1px solid rgba(180,85,29,.2); font-size:14px; }
.alerts li.late .al-when { background:var(--danger); color:#fff; }
.al-when { font-size:11.5px; font-weight:700; text-transform:uppercase; letter-spacing:.04em;
  padding:3px 8px; border-radius:99px; background:var(--dep); color:#fff; white-space:nowrap; }
.al-what { flex:1 1 220px; }
.al-sub { display:block; font-size:12.5px; color:var(--dim); }
.more-row { display:flex; align-items:center; gap:12px; justify-content:center; padding:14px 24px 0; }
.foot-note { color:var(--dim); }
.imp-mode { display:grid; gap:8px; margin:12px 0 14px; }
.imp-mode label { display:flex; gap:10px; align-items:flex-start; padding:10px 12px; border:1px solid var(--line);
  border-radius:8px; cursor:pointer; background:var(--panel); }
.imp-mode label.on { border-color:var(--ink); box-shadow:inset 0 0 0 1px var(--ink); }
.imp-mode input { margin-top:3px; }
.imp-mode b { display:block; font-size:14px; }
.imp-mode small { display:block; color:var(--dim); font-size:12.5px; line-height:1.45; margin-top:2px; }
.btn.danger:disabled { opacity:.4; cursor:default; }
.import-ok { margin-top:10px; color:var(--arr); font-weight:600; font-size:14px; }
.import-bad { margin-top:10px; color:var(--danger); font-weight:600; font-size:14px; }

@media (max-width:640px){
  .board { padding:18px 16px 14px; }
  .toolbar, .table-wrap { margin-left:12px; margin-right:12px; padding-left:0; padding-right:0; }
  .toolbar { padding:14px 12px 4px; }
}
@media (prefers-reduced-motion: reduce){ .tlt * { transition:none !important; } }
`;
