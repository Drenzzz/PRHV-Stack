// Read a text field from FormData, safely narrowed to string.
export function formString(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value : "";
}
