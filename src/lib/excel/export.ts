import ExcelJS from "exceljs";
import { formatDate } from "@/lib/domain";

export type ExportableMovement = {
  refNo: number;
  passenger: { fullName: string };
  arrivalDate: Date | null;
  arrivalTime: string | null;
  arrivalFlight: string | null;
  arrivalDestination: string | null;
  departureDate: Date | null;
  departureTime: string | null;
  departureFlight: string | null;
  departureDestination: string | null;
  requestEmailDate: Date | null;
  receivedFrom: string | null;
  registeredBy: { name: string } | null;
  status: string;
  remarks: string | null;
};

const HEADERS = [
  "No.",
  "Name",
  "Arrival",
  "Time",
  "Destination",
  "Departure",
  "Time",
  "Destination",
  "E-Mail date",
  "Received From",
  "Flight A",
  "Flight D",
  "Reg by",
  "Status",
  "Remarks",
] as const;

/**
 * Writes movements to an .xlsx workbook that mirrors the original Master Sheet
 * layout, so exports stay usable by anyone still working in Excel. The one
 * change is that the combined "Flight A/D" column is exported as two explicit
 * columns; the importer reads either form.
 */
export async function buildMovementWorkbook(
  movements: ExportableMovement[],
  options: { title?: string } = {},
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Travel Logistics Management System";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Flights", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = [
    { width: 9 },
    { width: 32 },
    { width: 13 },
    { width: 8 },
    { width: 20 },
    { width: 13 },
    { width: 8 },
    { width: 20 },
    { width: 13 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 30 },
  ];

  const headerRow = sheet.addRow([...HEADERS]);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF14532D" },
    };
  });
  headerRow.height = 22;

  for (const movement of movements) {
    sheet.addRow([
      movement.refNo,
      movement.passenger.fullName,
      formatDate(movement.arrivalDate),
      movement.arrivalTime ?? "",
      movement.arrivalDestination ?? "",
      formatDate(movement.departureDate),
      movement.departureTime ?? "",
      movement.departureDestination ?? "",
      formatDate(movement.requestEmailDate),
      movement.receivedFrom ?? "",
      movement.arrivalFlight ?? "",
      movement.departureFlight ?? "",
      movement.registeredBy?.name ?? "",
      movement.status,
      movement.remarks ?? "",
    ]);
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: HEADERS.length },
  };

  if (options.title) {
    workbook.title = options.title;
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
