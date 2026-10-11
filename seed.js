const db = require("./db");

if (db.prepare("SELECT COUNT(*) c FROM donors").get().c > 0) {
    console.log("Donors already exist. Nothing to seed.");
    process.exit(0);
}
const rows = [
    ["Rahul Sharma", 28, "O+", "Lucknow", "9876543210", "2026-03-10"],
    ["Priya Singh", 25, "A+", "Lucknow", "9812345678", null],
    ["Amit Verma", 32, "B+", "Kanpur", "9898989898", "2026-09-01"],
    ["Sneha Gupta", 22, "AB-", "Delhi", "9765432109", "2026-01-15"],
    ["Mohd. Faiz", 35, "O-", "Lucknow", "9700011122", null]
];
const ins = db.prepare(
    "INSERT INTO donors(user_id,name,age,blood_group,city,phone,last_donation) VALUES(NULL,?,?,?,?,?,?)"
);
rows.forEach(r => ins.run(...r));
console.log("Seeded", rows.length, "sample donors.");
