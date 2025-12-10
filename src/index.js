require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const mysql = require("mysql2/promise");
const { body, validationResult } = require("express-validator");

const app = express();
const PORT = process.env.PORT || 3000;

// Database connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: process.env.MYSQL_PORT || 3306,
  user: process.env.MYSQL_USER || "cpss",
  password: process.env.MYSQL_PASSWORD || "cpss_secure_password",
  database: process.env.MYSQL_DATABASE || "cpss_registration",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Get all clubs
app.get("/api/clubs", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT id, name FROM clubs ORDER BY name");
    res.json(rows);
  } catch (error) {
    console.error("Error fetching clubs:", error);
    res.status(500).json({ error: "Failed to fetch clubs" });
  }
});

// Add new club
app.post(
  "/api/clubs",
  body("name").trim().notEmpty().withMessage("Club name is required"),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    try {
      const { name } = req.body;
      // Check if club exists
      const [existing] = await pool.query(
        "SELECT id, name FROM clubs WHERE name = ?",
        [name]
      );
      if (existing.length > 0) {
        return res.status(201).json(existing[0]);
      }
      // Insert new club
      const [result] = await pool.query("INSERT INTO clubs (name) VALUES (?)", [
        name,
      ]);
      res.status(201).json({ id: result.insertId, name });
    } catch (error) {
      console.error("Error adding club:", error);
      res.status(500).json({ error: "Failed to add club" });
    }
  }
);

// Validation middleware for registration
const registrationValidation = [
  body("athlete1.lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name is required"),
  body("athlete1.firstName")
    .trim()
    .notEmpty()
    .withMessage("First name is required"),
  body("athlete1.birthDate")
    .isDate()
    .withMessage("Valid birth date is required"),
  body("athlete1.nationality")
    .trim()
    .notEmpty()
    .withMessage("Nationality is required"),
  body("athlete1.gender")
    .isIn(["male", "female"])
    .withMessage("Gender must be male or female"),
  body("athlete1.email").isEmail().withMessage("Valid email is required"),
  body("athlete1.phone")
    .trim()
    .notEmpty()
    .withMessage("Phone number is required"),
  body("isPair").isBoolean(),
  body("athlete2.lastName").if(body("isPair").equals(true)).trim().notEmpty(),
  body("athlete2.firstName").if(body("isPair").equals(true)).trim().notEmpty(),
  body("athlete2.birthDate").if(body("isPair").equals(true)).isDate(),
  body("athlete2.nationality")
    .if(body("isPair").equals(true))
    .trim()
    .notEmpty(),
  body("athlete2.gender")
    .if(body("isPair").equals(true))
    .isIn(["male", "female"]),
  body("athlete2.email").if(body("isPair").equals(true)).isEmail(),
  body("athlete2.phone").if(body("isPair").equals(true)).trim().notEmpty(),
];

// Submit registration
app.post("/api/registrations", registrationValidation, async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { athlete1, athlete2, isPair, locale } = req.body;

  try {
    const [result] = await pool.query(
      `INSERT INTO registrations (
        athlete1_last_name, athlete1_first_name, athlete1_birth_date,
        athlete1_club_id, athlete1_nationality, athlete1_gender,
        athlete1_email, athlete1_phone,
        is_pair,
        athlete2_last_name, athlete2_first_name, athlete2_birth_date,
        athlete2_club_id, athlete2_nationality, athlete2_gender,
        athlete2_email, athlete2_phone,
        locale
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        athlete1.lastName,
        athlete1.firstName,
        athlete1.birthDate,
        athlete1.clubId || null,
        athlete1.nationality,
        athlete1.gender,
        athlete1.email,
        athlete1.phone,
        isPair,
        isPair ? athlete2.lastName : null,
        isPair ? athlete2.firstName : null,
        isPair ? athlete2.birthDate : null,
        isPair && athlete2.clubId ? athlete2.clubId : null,
        isPair ? athlete2.nationality : null,
        isPair ? athlete2.gender : null,
        isPair ? athlete2.email : null,
        isPair ? athlete2.phone : null,
        locale || "fr",
      ]
    );

    res.status(201).json({
      success: true,
      registrationId: result.insertId,
      message: "Registration successful",
    });
  } catch (error) {
    console.error("Error creating registration:", error);
    res.status(500).json({ error: "Failed to create registration" });
  }
});

// Get all registrations (admin endpoint)
app.get("/api/registrations", async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, 
             c1.name as athlete1_club_name,
             c2.name as athlete2_club_name
      FROM registrations r
      LEFT JOIN clubs c1 ON r.athlete1_club_id = c1.id
      LEFT JOIN clubs c2 ON r.athlete2_club_id = c2.id
      ORDER BY r.registration_date DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("Error fetching registrations:", error);
    res.status(500).json({ error: "Failed to fetch registrations" });
  }
});

// Start server
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
