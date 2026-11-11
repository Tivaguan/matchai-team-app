import { formatDay, formatTime } from "@/lib/format";
import type { DayReport, MonthReport } from "@/lib/reports";

// Excel and PDF files for the owners. The libraries are heavy, so they are
// only loaded when an export button is pressed.

type Row = (string | number | null)[];
type Sheet = { name: string; title: string; header: string[]; rows: Row[]; totals?: Row };

const MONEY_FORMAT = "#,##0.00";

function monthTitle(month: string) {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(`${month}-01T00:00:00Z`),
  );
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function daySheets(report: DayReport): Sheet[] {
  return [
    {
      name: "Summary",
      title: `Matchai · ${formatDay(report.day)}`,
      header: ["", "Amount (MAD)", "Who", "Time", "Notes and coins"],
      rows: [
        ["Opening count", report.opening?.amount ?? null, report.opening?.who ?? "", report.opening ? formatTime(report.opening.at) : "", report.opening?.detail ?? ""],
        ["Closing count", report.closing?.amount ?? null, report.closing?.who ?? "", report.closing ? formatTime(report.closing.at) : "", report.closing?.detail ?? ""],
        ["Expenses", report.expensesTotal, "", "", ""],
        ["Closing − opening", report.difference, "", "", ""],
        ["Cash sales (closing − opening + expenses)", report.net, "", "", ""],
      ],
    },
    {
      name: "Expenses",
      title: `Expenses · ${formatDay(report.day)}`,
      header: ["Time", "Who", "Reason", "Amount (MAD)"],
      rows: report.expenses.map((expense) => [formatTime(expense.at), expense.who, expense.reason, expense.amount]),
      totals: ["Total", "", "", report.expensesTotal],
    },
  ];
}

function monthSheets(report: MonthReport): Sheet[] {
  return [
    {
      name: "Days",
      title: `Matchai · ${monthTitle(report.month)}`,
      header: ["Day", "Opening (MAD)", "Closing (MAD)", "Expenses (MAD)", "Closing − opening", "Cash sales"],
      rows: report.days.map((day) => [
        formatDay(day.day),
        day.opening?.amount ?? null,
        day.closing?.amount ?? null,
        day.expensesTotal,
        day.difference,
        day.net,
      ]),
      totals: ["Month total", null, null, report.totals.expenses, report.totals.difference, report.totals.net],
    },
    {
      name: "Expenses",
      title: `Expenses · ${monthTitle(report.month)}`,
      header: ["Day", "Time", "Who", "Reason", "Amount (MAD)"],
      rows: report.days.flatMap((day) =>
        day.expenses.map((expense) => [formatDay(day.day), formatTime(expense.at), expense.who, expense.reason, expense.amount]),
      ),
      totals: ["Total", "", "", "", report.totals.expenses],
    },
  ];
}

async function toExcel(sheets: Sheet[], fileName: string) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    worksheet.addRow([sheet.title]).font = { bold: true, size: 14 };
    worksheet.addRow([]);
    worksheet.addRow(sheet.header).font = { bold: true };
    for (const row of sheet.rows) worksheet.addRow(row);
    if (sheet.totals) worksheet.addRow(sheet.totals).font = { bold: true };

    worksheet.columns.forEach((column, index) => {
      const widest = Math.max(sheet.header[index]?.length ?? 0, ...sheet.rows.map((row) => String(row[index] ?? "").length));
      column.width = Math.min(Math.max(widest + 2, 12), 60);
      column.numFmt = MONEY_FORMAT;
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}

function money(value: string | number | null) {
  if (value === null) return "—";
  if (typeof value === "string") return value;
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function toPdf(sheets: Sheet[], fileName: string) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  let y = 40;

  for (const sheet of sheets) {
    if (sheet.rows.length === 0 && !sheet.totals) continue;
    pdf.setFontSize(14);
    pdf.text(sheet.title.replaceAll("−", "-"), 40, y);

    autoTable(pdf, {
      startY: y + 12,
      head: [sheet.header.map((cell) => cell.replaceAll("−", "-"))],
      body: sheet.rows.map((row) => row.map((cell) => money(cell).replaceAll("−", "-").replaceAll("×", "x"))),
      foot: sheet.totals ? [sheet.totals.map((cell) => (cell === null ? "" : money(cell)))] : undefined,
      styles: { fontSize: 9, cellPadding: 5 },
      headStyles: { fillColor: [20, 20, 20] },
      footStyles: { fillColor: [235, 233, 226], textColor: [20, 20, 20] },
      margin: { left: 40, right: 40 },
    });
    // jspdf-autotable records where the table ended on the document.
    y = (pdf as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 36;
  }

  pdf.save(fileName);
}

export const exportDay = {
  excel: (report: DayReport) => toExcel(daySheets(report), `matchai-${report.day}.xlsx`),
  pdf: (report: DayReport) => toPdf(daySheets(report), `matchai-${report.day}.pdf`),
};

export const exportMonth = {
  excel: (report: MonthReport) => toExcel(monthSheets(report), `matchai-${report.month}.xlsx`),
  pdf: (report: MonthReport) => toPdf(monthSheets(report), `matchai-${report.month}.pdf`),
};
