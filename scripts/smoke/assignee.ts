import {
  defaultAssigneeId,
  resolveAssigneeId,
  soleId,
} from "../../src/lib/assignee";

if (soleId([]) !== null) throw new Error("lista vacía");
if (soleId([{ id: "a" }]) !== "a") throw new Error("un solo id");
if (soleId([{ id: "a" }, { id: "b" }]) !== null) throw new Error("dos ids");
if (defaultAssigneeId([{ id: "u1" }]) !== "u1") throw new Error("default 1");
if (defaultAssigneeId([{ id: "u1" }, { id: "u2" }]) !== "") {
  throw new Error("default varios");
}
if (resolveAssigneeId("x", "u1") !== "x") throw new Error("explícito gana");
if (resolveAssigneeId("", "u1") !== "u1") throw new Error("vacío usa sole");
if (resolveAssigneeId(null, "u1") !== "u1") throw new Error("null usa sole");
if (resolveAssigneeId(undefined, null) !== null) throw new Error("nada");
console.log("ok");
