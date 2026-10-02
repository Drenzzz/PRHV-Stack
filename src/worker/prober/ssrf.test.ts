import { expect, test } from "bun:test";
import { isPrivateIp } from "./ssrf";

// SSRF guard unit tests (REQ-034): fail-closed IP classification.

test("loopback is private", () => {
  expect(isPrivateIp("127.0.0.1")).toBe(true);
  expect(isPrivateIp("127.9.9.9")).toBe(true);
});

test("private ranges are private", () => {
  expect(isPrivateIp("10.0.0.1")).toBe(true);
  expect(isPrivateIp("172.16.0.1")).toBe(true);
  expect(isPrivateIp("172.31.255.255")).toBe(true);
  expect(isPrivateIp("192.168.1.1")).toBe(true);
});

test("cloud metadata and link-local are private", () => {
  expect(isPrivateIp("169.254.169.254")).toBe(true);
  expect(isPrivateIp("169.254.0.1")).toBe(true);
});

test("CGNAT, multicast, reserved are private", () => {
  expect(isPrivateIp("100.64.0.1")).toBe(true);
  expect(isPrivateIp("224.0.0.1")).toBe(true);
  expect(isPrivateIp("0.0.0.0")).toBe(true);
});

test("public IPs are not private", () => {
  expect(isPrivateIp("8.8.8.8")).toBe(false);
  expect(isPrivateIp("1.1.1.1")).toBe(false);
  expect(isPrivateIp("172.32.0.1")).toBe(false); // just above 172.16-31
  expect(isPrivateIp("100.63.0.1")).toBe(false); // just below CGNAT
});

test("IPv6 private forms", () => {
  expect(isPrivateIp("::1")).toBe(true);
  expect(isPrivateIp("fe80::1")).toBe(true);
  expect(isPrivateIp("fd00::1")).toBe(true);
  expect(isPrivateIp("::ffff:127.0.0.1")).toBe(true); // v4-mapped loopback
  expect(isPrivateIp("2606:4700::1111")).toBe(false);
});

test("unparseable input fails closed", () => {
  expect(isPrivateIp("not-an-ip")).toBe(true);
});
