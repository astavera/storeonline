import { departments, getDepartmentBySlug } from "@/config/departments.config";

export function listVisibleDepartments() {
  return departments.filter((department) => department.is_visible).sort((a, b) => a.sort_order - b.sort_order);
}

export function requireDepartment(slug: string) {
  const department = getDepartmentBySlug(slug);

  if (!department) {
    throw new Error(`Department not found: ${slug}`);
  }

  return department;
}
