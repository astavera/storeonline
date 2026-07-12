import { holidays } from "@/config/holidays.config";

export function listVisibleHolidays() {
  return holidays.filter((holiday) => holiday.is_visible).sort((a, b) => a.sort_order - b.sort_order);
}

export function listActiveHolidays(date = new Date()) {
  return listVisibleHolidays().filter((holiday) => {
    const starts = new Date(`${holiday.start_date}T00:00:00.000Z`);
    const ends = new Date(`${holiday.end_date}T23:59:59.999Z`);
    return holiday.is_active && starts <= date && date <= ends;
  });
}
