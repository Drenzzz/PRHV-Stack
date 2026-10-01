import { expect, test } from "bun:test";
import { formString } from "./form";

test("reads string values from FormData", () => {
  const form = new FormData();
  form.set("name", "PRHV");

  expect(formString(form, "name")).toBe("PRHV");
});

test("returns an empty string for missing and file values", () => {
  const form = new FormData();
  form.set("file", new File(["content"], "example.txt"));

  expect(formString(form, "missing")).toBe("");
  expect(formString(form, "file")).toBe("");
});
