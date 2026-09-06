/**
 * Seeds reference data and an administrator account.
 *
 * Run with `npm run db:seed`. It is idempotent: re-running updates the
 * reference lists without duplicating them and leaves existing movements alone.
 *
 * Pass --demo to add a small set of clearly-marked sample movements so the
 * dashboard has something to show before the first real import.
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");

const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });

/** The travel desk coordinators recorded in the "Reg by" column. */
const STAFF = ["Kamiran", "Mohammed", "Zana", "Idrees", "Farhang", "Omed"];

/** The channels requests arrive through ("Received From"). */
const SOURCES = ["KT", "TRF", "Movcon", "Direct", "Client"];

const HOTELS = [
  { name: "Ramada", city: "Erbil" },
  { name: "Rotana", city: "Erbil" },
  { name: "Divan", city: "Erbil" },
  { name: "Wings", city: "Erbil" },
  { name: "Classy", city: "Erbil" },
];

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@travel.local";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const admin = await db.user.upsert({
    where: { email },
    update: { role: "ADMIN", active: true },
    create: {
      email,
      name: "Administrator",
      role: "ADMIN",
      passwordHash: await bcrypt.hash(password, 12),
    },
  });
  console.log(`✔ Administrator ready: ${admin.email}`);

  for (const name of STAFF) {
    await db.staffMember.upsert({
      where: { name },
      update: {},
      create: { name, initials: name.slice(0, 2).toUpperCase() },
    });
  }
  console.log(`✔ ${STAFF.length} travel desk coordinators`);

  for (const name of SOURCES) {
    await db.requestSource.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`✔ ${SOURCES.length} request sources`);

  for (const hotel of HOTELS) {
    await db.hotel.upsert({
      where: { name: hotel.name },
      update: { city: hotel.city },
      create: hotel,
    });
  }
  console.log(`✔ ${HOTELS.length} hotels`);

  if (process.argv.includes("--demo")) {
    await seedDemoMovements();
  }
}

/** Sample records so the dashboard is not empty on a fresh install. */
async function seedDemoMovements() {
  const existing = await db.movement.count();
  if (existing > 0) {
    console.log("• Movements already exist — skipping demo data");
    return;
  }

  const staff = await db.staffMember.findMany();
  const today = new Date();
  const day = (offset: number) =>
    new Date(
      Date.UTC(
        today.getUTCFullYear(),
        today.getUTCMonth(),
        today.getUTCDate() + offset,
      ),
    );

  const samples = [
    { name: "Sample Passenger One", arrival: -12, departure: 6, arrTime: "15:50", depTime: "16:50", arrFlight: "FZ 203", depFlight: "FZ 204", dest: "EIA to Ramada", back: "Ramada to EIA", from: "TRF", remarks: "CIP", trf: true },
    { name: "Sample Passenger Two", arrival: -3, departure: 21, arrTime: "23:45", depTime: "09:55", arrFlight: "TK 316", depFlight: "TK 315", dest: "EIA to Field", back: "Field to EIA", from: "KT", remarks: "FT", trf: true },
    { name: "Sample Passenger Three", arrival: 0, departure: 28, arrTime: "11:25", depTime: "12:05", arrFlight: "G 9357", depFlight: "G 9358", dest: "EIA to Rotana", back: "Rotana to EIA", from: "KT", remarks: "", trf: true },
    { name: "Sample Passenger Four", arrival: 2, departure: 30, arrTime: "03:05", depTime: "04:20", arrFlight: "RJ 824", depFlight: "RJ 825", dest: "TBC", back: "TBC", from: "Movcon", remarks: "No TRF yet", trf: false },
    { name: "Sample Passenger Five", arrival: 5, departure: null, arrTime: null, depTime: null, arrFlight: "QR 454", depFlight: null, dest: "TBC", back: null, from: "KT", remarks: "Awaiting confirmation", trf: false },
  ];

  let refNo = 9000;
  for (const sample of samples) {
    refNo += 1;
    const passenger = await db.passenger.create({
      data: {
        fullName: sample.name,
        normalizedName: sample.name.toUpperCase(),
        company: "Demo Data — safe to delete",
      },
    });

    await db.movement.create({
      data: {
        refNo,
        passengerId: passenger.id,
        arrivalDate: day(sample.arrival),
        arrivalTime: sample.arrTime,
        arrivalFlight: sample.arrFlight,
        arrivalDestination: sample.dest,
        departureDate: sample.departure === null ? null : day(sample.departure),
        departureTime: sample.depTime,
        departureFlight: sample.depFlight,
        departureDestination: sample.back,
        requestEmailDate: day(sample.arrival - 7),
        receivedFrom: sample.from,
        registeredById: staff[refNo % staff.length]?.id ?? null,
        remarks: sample.remarks || null,
        trfReceived: sample.trf,
        cipRequested: /cip/i.test(sample.remarks),
        status: sample.arrival <= 0 ? "ARRIVED" : "PLANNED",
      },
    });
  }
  console.log(`✔ ${samples.length} demo movements (marked "Demo Data — safe to delete")`);
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
