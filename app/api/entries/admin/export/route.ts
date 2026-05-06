import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';
import mongoose from 'mongoose';
import { requireAdmin } from '@/lib/auth';
import { connectDB, WorkEntry } from '@/lib/db';

type PopulatedUser     = { _id: mongoose.Types.ObjectId; name: string; email: string };
type PopulatedLocation = { _id: mongoose.Types.ObjectId; name: string };
type PopulatedEntry    = {
  _id: mongoose.Types.ObjectId;
  user_id: PopulatedUser;
  location_id: PopulatedLocation;
  date: string;
  hours: number;
  start_time: string | null;
  end_time: string | null;
  notes: string;
};

export async function GET(req: NextRequest) {
  const admin = await requireAdmin(req);
  if (admin instanceof NextResponse) return admin;

  const year  = req.nextUrl.searchParams.get('year');
  const month = req.nextUrl.searchParams.get('month');
  if (!year || !month)
    return NextResponse.json({ error: 'Anno e mese obbligatori' }, { status: 400 });

  const prefix     = `${year}-${String(month).padStart(2, '0')}`;
  const monthLabel = `${String(month).padStart(2, '0')}/${year}`;

  await connectDB();
  const rows = await WorkEntry
    .find({ date: { $regex: `^${prefix}` } })
    .populate('user_id', 'name email')
    .populate('location_id', 'name')
    .lean() as unknown as PopulatedEntry[];

  const toFrac = (mins: number) => mins / 1440;

  const summaryMap = new Map<string, { userName: string; locationName: string; totalMinutes: number; days: Set<string> }>();
  for (const e of rows) {
    const uid = String(e.user_id?._id ?? e.user_id);
    const lid = String(e.location_id?._id ?? e.location_id);
    const key = `${uid}__${lid}`;
    if (!summaryMap.has(key)) {
      summaryMap.set(key, {
        userName:     (e.user_id as PopulatedUser)?.name ?? '',
        locationName: (e.location_id as PopulatedLocation)?.name ?? '',
        totalMinutes: 0,
        days:         new Set(),
      });
    }
    const row = summaryMap.get(key)!;
    row.totalMinutes += Math.round(e.hours * 60);
    row.days.add(e.date);
  }

  const summary = Array.from(summaryMap.values()).sort(
    (a, b) => a.userName.localeCompare(b.userName) || a.locationName.localeCompare(b.locationName)
  );

  const C = {
    navy: '1E3A5F', navyLight: '2563EB', white: 'FFFFFF', rowAlt: 'F0F4FA',
    sectionBg: 'E2EAF6', totalBg: 'FEF9C3', totalBold: 'D97706', border: 'CBD5E1', text: '1E293B',
  };

  const headerFill = (color: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${color}` } });

  const border = (color = C.border): Partial<ExcelJS.Borders> => ({
    top:    { style: 'thin', color: { argb: `FF${color}` } },
    bottom: { style: 'thin', color: { argb: `FF${color}` } },
    left:   { style: 'thin', color: { argb: `FF${color}` } },
    right:  { style: 'thin', color: { argb: `FF${color}` } },
  });

  const applyHeader = (row: ExcelJS.Row, bgColor: string, textColor = C.white) => {
    row.height = 28;
    row.eachCell((cell) => {
      cell.fill = headerFill(bgColor);
      cell.font = { bold: true, color: { argb: `FF${textColor}` }, size: 14 };
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.border = border();
    });
  };

  const applyDataRow = (row: ExcelJS.Row, alt: boolean) => {
    row.height = 22;
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = headerFill(alt ? C.rowAlt : C.white);
      cell.font = { color: { argb: `FF${C.text}` }, size: 13 };
      cell.alignment = { vertical: 'middle' };
      cell.border = border();
    });
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = 'Solky Care';
  wb.created = new Date();

  // Foglio Riepilogo
  const wsSummary = wb.addWorksheet('Riepilogo');
  wsSummary.columns = [
    { key: 'name', width: 28 }, { key: 'location', width: 22 },
    { key: 'hours', width: 14 }, { key: 'days', width: 16 },
  ];
  wsSummary.mergeCells('A1:D1');
  const titleCell = wsSummary.getCell('A1');
  titleCell.value = `Riepilogo Ore — ${monthLabel}`;
  titleCell.fill = headerFill(C.navy);
  titleCell.font = { bold: true, size: 18, color: { argb: `FF${C.white}` } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  wsSummary.getRow(1).height = 36;
  wsSummary.addRow([]);
  const sumHeader = wsSummary.addRow(['Dipendente', 'Location', 'Ore Totali', 'Giorni Lavorati']);
  applyHeader(sumHeader, C.navyLight);
  let lastUser = '';
  summary.forEach((r, i) => {
    const dataRow = wsSummary.addRow([r.userName, r.locationName, toFrac(r.totalMinutes), r.days.size]);
    applyDataRow(dataRow, i % 2 === 0);
    if (r.userName !== lastUser) {
      dataRow.getCell(1).font = { bold: true, color: { argb: `FF${C.text}` }, size: 13 };
      lastUser = r.userName;
    }
    dataRow.getCell(3).numFmt = '[h]:mm';
    dataRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
    dataRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  wsSummary.addRow([]);
  const userTotalMinutes: Record<string, number> = {};
  summary.forEach((r) => { userTotalMinutes[r.userName] = (userTotalMinutes[r.userName] ?? 0) + r.totalMinutes; });
  const totSectionRow = wsSummary.addRow(['Totali per Dipendente', '', '', '']);
  wsSummary.mergeCells(`A${totSectionRow.number}:D${totSectionRow.number}`);
  totSectionRow.height = 20;
  totSectionRow.getCell(1).fill = headerFill(C.sectionBg);
  totSectionRow.getCell(1).font = { bold: true, size: 14, color: { argb: `FF${C.navy}` } };
  totSectionRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
  totSectionRow.getCell(1).border = border();
  Object.entries(userTotalMinutes).forEach(([name, mins], i) => {
    const tRow = wsSummary.addRow([name, '', toFrac(mins), '']);
    applyDataRow(tRow, i % 2 === 0);
    tRow.getCell(1).font = { bold: true, color: { argb: `FF${C.text}` }, size: 13 };
    tRow.getCell(3).numFmt = '[h]:mm';
    tRow.getCell(3).font = { bold: true, color: { argb: `FF${C.navyLight}` }, size: 13 };
    tRow.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
  });
  wsSummary.views = [{ state: 'frozen', ySplit: 3 }];

  // Fogli per utente
  const byUser = new Map<string, { name: string; entries: PopulatedEntry[] }>();
  for (const e of rows) {
    const uid = String(e.user_id?._id ?? e.user_id);
    const uname = (e.user_id as PopulatedUser)?.name ?? uid;
    if (!byUser.has(uid)) byUser.set(uid, { name: uname, entries: [] });
    byUser.get(uid)!.entries.push(e);
  }

  const sortedUsers = Array.from(byUser.values()).sort((a, b) => a.name.localeCompare(b.name));

  for (const { name, entries } of sortedUsers) {
    const sheetName = name.replace(/[\\/*?[\]]/g, '').slice(0, 31);
    const ws = wb.addWorksheet(sheetName);
    ws.columns = [
      { key: 'date', width: 14 }, { key: 'location', width: 20 },
      { key: 'start', width: 10 }, { key: 'end', width: 10 },
      { key: 'hours', width: 10 }, { key: 'notes', width: 35 },
    ];
    ws.mergeCells('A1:F1');
    const ut = ws.getCell('A1');
    ut.value = `${name} — ${monthLabel}`;
    ut.fill = headerFill(C.navy);
    ut.font = { bold: true, size: 18, color: { argb: `FF${C.white}` } };
    ut.alignment = { vertical: 'middle', horizontal: 'center' };
    ws.getRow(1).height = 36;
    ws.addRow([]);
    const colHeader = ws.addRow(['Data', 'Location', 'Inizio', 'Fine', 'Ore', 'Note']);
    applyHeader(colHeader, C.navyLight);
    const sorted = [...entries].sort(
      (a, b) => a.date.localeCompare(b.date) ||
        ((a.location_id as PopulatedLocation)?.name ?? '').localeCompare((b.location_id as PopulatedLocation)?.name ?? '')
    );
    sorted.forEach((e, i) => {
      const dr = ws.addRow([
        e.date, (e.location_id as PopulatedLocation)?.name ?? '',
        e.start_time ?? '', e.end_time ?? '',
        toFrac(Math.round(e.hours * 60)), e.notes ?? '',
      ]);
      applyDataRow(dr, i % 2 === 0);
      dr.getCell(5).numFmt = '[h]:mm';
      dr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
      dr.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' };
      dr.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.addRow([]);
    const locMinutes = new Map<string, number>();
    for (const e of entries) {
      const loc = (e.location_id as PopulatedLocation)?.name ?? '';
      locMinutes.set(loc, (locMinutes.get(loc) ?? 0) + Math.round(e.hours * 60));
    }
    const locSecRow = ws.addRow(['Totale per Location', '', '', '', '', '']);
    ws.mergeCells(`A${locSecRow.number}:F${locSecRow.number}`);
    locSecRow.height = 20;
    locSecRow.getCell(1).fill = headerFill(C.sectionBg);
    locSecRow.getCell(1).font = { bold: true, size: 14, color: { argb: `FF${C.navy}` } };
    locSecRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' };
    locSecRow.getCell(1).border = border();
    Array.from(locMinutes.entries()).forEach(([loc, mins], i) => {
      const lr = ws.addRow(['', loc, '', '', toFrac(mins), '']);
      applyDataRow(lr, i % 2 === 0);
      lr.getCell(2).font = { bold: true, color: { argb: `FF${C.text}` }, size: 13 };
      lr.getCell(5).numFmt = '[h]:mm';
      lr.getCell(5).font = { bold: true, color: { argb: `FF${C.navyLight}` }, size: 13 };
      lr.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.addRow([]);
    const grandTotalMins = Array.from(locMinutes.values()).reduce((a, b) => a + b, 0);
    const gtRow = ws.addRow(['Totale Ore', '', '', '', toFrac(grandTotalMins), '']);
    ws.mergeCells(`A${gtRow.number}:D${gtRow.number}`);
    gtRow.height = 24;
    gtRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = headerFill(C.totalBg);
      cell.font = { bold: true, size: 15, color: { argb: `FF${C.totalBold}` } };
      cell.border = border(C.totalBold);
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
    });
    gtRow.getCell(5).numFmt = '[h]:mm';
    ws.views = [{ state: 'frozen', ySplit: 3 }];
  }

  const buf = await wb.xlsx.writeBuffer();
  return new NextResponse(buf, {
    headers: {
      'Content-Disposition': `attachment; filename="ore_${year}_${String(month).padStart(2, '0')}.xlsx"`,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    },
  });
}
