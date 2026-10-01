// Regression checks for alias matching in src/lib/skill-dictionary.ts.
//
//   npm test        (builds, then runs this file)
//
// Guards against substring false positives that skewed score_ats_match: "ts" firing inside
// "requirements", "rag" inside "leverage", and similar. Runs against the built dist/.
import assert from "node:assert/strict";
import { extractSkills } from "../dist/lib/skill-dictionary.js";

const skillsIn = (text) => new Set(extractSkills(text).map((m) => m.canonical));

let failures = 0;
function check(label, text, { has = [], lacks = [] }) {
  const found = skillsIn(text);
  try {
    for (const s of has) assert.ok(found.has(s), `expected ${s}`);
    for (const s of lacks) assert.ok(!found.has(s), `did not expect ${s}`);
    console.log(`ok    ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label}: ${err.message}\n      text: ${JSON.stringify(text)}\n      found: ${[...found].join(", ")}`);
  }
}

// Substrings of ordinary words must not count.
check("no TypeScript/RAG inside ordinary words", "requirements, assignments, leverage, measurements", {
  lacks: ["TypeScript", "RAG"],
});
check("no RAG in coverage/storage/average/fragment", "test coverage, storage, average, fragment, leveraging", {
  lacks: ["RAG"],
});
check("no BERT in names", "Report to Robert and Albert", { lacks: ["BERT / NLP"] });
check("no SQL inside NoSQL/MySQL/PostgreSQL", "NoSQL, MySQL, PostgreSQL", { has: ["MySQL", "PostgreSQL"], lacks: ["SQL"] });
check("no Java inside JavaScript", "JavaScript", { has: ["JavaScript"], lacks: ["Java"] });

// The positive case from the bug report.
check("real mentions still match", "TypeScript, TS, RAG pipeline, C++, C#, Go", {
  has: ["TypeScript", "RAG", "C++", "C#", "Go"],
  lacks: ["C"],
});
check("bare TS and RAG", "Built a RAG system in TS", { has: ["TypeScript", "RAG"] });

// C and its look-alikes.
check("C in a language list", "Proficient in C/C++ and Python", { has: ["C", "C++"] });
check("C++ with a standard version", "Modern C++17 experience", { has: ["C++"], lacks: ["C"] });
check("C look-alikes", "Series C startup, C-suite, Objective-C, USB-C, Washington, D.C., a) b) c)", { lacks: ["C"] });

// Go and its look-alikes.
check("golang", "golang microservices", { has: ["Go", "Microservices"] });
check("Go in a sentence", "Services are written in Go and Rust.", { has: ["Go", "Rust"] });
check("Go as a verb", "Go above and beyond. Own go-to-market work. Go-to person. Ready to go.", { lacks: ["Go"] });

// .NET / Node.js / React punctuation and ambiguity.
check(".NET forms", "ASP.NET Core and .NET 8", { has: [".NET"] });
check("domain names are not .NET", "Apply at careers.example.net", { lacks: [".NET"] });
check("Node.js and React", "Node.js, React.js, React Native", { has: ["Node.js", "React"] });
check("react/node/spark as ordinary words", "react to feedback, each node in a graph, spark curiosity", {
  lacks: ["React", "Node.js", "Spark"],
});

// Clearance and project-status jargon.
check("TS/SCI clearance is not TypeScript", "Active TS/SCI clearance; Top Secret (TS) required", { lacks: ["TypeScript"] });
check("RAG status is not RAG", "Maintain RAG status reports", { lacks: ["RAG"] });
check("HVAC airflow is not Apache Airflow", "optimize airflow in building systems", { lacks: ["Airflow"] });

// Multi-word and plural aliases.
check("multi-word phrases", "retrieval-augmented generation over vector databases with REST APIs and unit testing", {
  has: ["RAG", "Vector databases", "REST APIs", "Testing / unit tests"],
});
check("versioned tokens", "HTML5, CSS3, OAuth 2.0, SQLite3", { has: ["HTML/CSS", "Authentication (JWT/OAuth)", "SQLite"] });

if (failures) {
  console.log(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
