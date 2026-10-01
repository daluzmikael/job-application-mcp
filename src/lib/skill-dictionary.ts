export interface SkillEntry {
  canonical: string;
  /**
   * A string alias is regex source matched case-insensitively as a whole token: it may not
   * touch a letter or digit on either side, so "ts" can't fire inside "requirements" and "rag"
   * can't fire inside "leverage". Lookarounds are used instead of \b so aliases that start or
   * end in punctuation still behave. A RegExp alias is used verbatim (no added boundaries,
   * its own flags) for tokens that need case sensitivity or custom edges (C, Go, C++, .NET).
   */
  aliases: (string | RegExp)[];
}

// Canonical skill list = Mikael's actual inventory (CLAUDE_MEMORY_JOB_SEARCH.md section 7)
// plus common adjacent/competing technologies, so gap analysis can surface
// things he genuinely doesn't have yet, not just things he does.
// Token edges for whole-word matching. Used instead of \b because \b needs a word
// character on one side, which breaks for aliases like "c++", "c#" or ".net".
const B = "(?<![A-Za-z0-9])";
const E = "(?![A-Za-z0-9])";

/** Case-sensitive whole-token alias, for names that double as ordinary English words ("go", "react", "spark"). */
const exact = (src: string) => new RegExp(`${B}(?:${src})${E}`);

export const SKILL_DICTIONARY: SkillEntry[] = [
  // AI & ML
  { canonical: "LLM integration", aliases: ["llm integrations?", "large language models?", "llm[- ]powered"] },
  { canonical: "OpenAI API", aliases: ["openai api", "openai"] },
  { canonical: "Prompt engineering", aliases: ["prompt engineering"] },
  { canonical: "Agentic workflows", aliases: ["agentic", "ai agents?", "tool-using agents?", "tool[- ]calling"] },
  // "RAG status" / "RAG rating" is red-amber-green project reporting, not retrieval.
  { canonical: "RAG", aliases: ["rag(?!\\s+(?:status|rating)\\b)", "retrieval[- ]augmented generation"] },
  { canonical: "NL-to-SQL", aliases: ["natural language to sql", "nl2sql", "nl-to-sql", "text-to-sql"] },
  { canonical: "BERT / NLP", aliases: ["bert", "nlp", "text classification"] },
  { canonical: "scikit-learn", aliases: ["scikit-learn", "sklearn"] },
  { canonical: "Pandas", aliases: ["pandas"] },
  { canonical: "NumPy", aliases: ["numpy"] },
  { canonical: "PyTorch", aliases: ["pytorch", "torch"] },
  { canonical: "TensorFlow", aliases: ["tensorflow"] },
  { canonical: "LangChain", aliases: ["langchain"] },
  { canonical: "Vector databases", aliases: ["vector databases?", "pinecone", "weaviate", "chroma(?:db)?", "pgvector"] },

  // Languages
  { canonical: "Python", aliases: ["python"] },
  { canonical: "SQL", aliases: ["sql"] },
  // "TS/SCI" and "Top Secret (TS)" are clearance levels in defense postings.
  { canonical: "TypeScript", aliases: ["typescript", "(?<!secret\\s*[(/]?\\s*)ts(?!\\s*/\\s*sci|\\s+clearance)"] },
  { canonical: "JavaScript", aliases: ["javascript", "js"] },
  // Capital C only, and not part of C++, C#, Objective-C, C-suite, USB-C, D.C., or "Series C".
  { canonical: "C", aliases: [/(?<![A-Za-z0-9+#.-])(?<!Series )C(?![A-Za-z0-9+#-])/] },
  { canonical: "C++", aliases: [/(?<![A-Za-z0-9])c\+\+/i, "cpp"] },
  { canonical: "C#", aliases: [/(?<![A-Za-z0-9])c#/i, "csharp"] },
  { canonical: "Java", aliases: ["java"] },
  // Capital Go only, and not the verb in "Go-to-market" / "Go above and beyond".
  {
    canonical: "Go",
    aliases: ["golang", exact("Go(?!-|\\s+(?:to|above|beyond|the|live|further|deep|deeper|ahead|get|big|far|fast|back|out)\\b)")],
  },
  { canonical: "Rust", aliases: ["rust"] },

  // Backend & APIs
  { canonical: "FastAPI", aliases: ["fastapi"] },
  { canonical: "Flask", aliases: ["flask"] },
  { canonical: "Django", aliases: ["django"] },
  { canonical: "REST APIs", aliases: ["rest apis?", "restful apis?"] },
  { canonical: "GraphQL", aliases: ["graphql"] },
  { canonical: "gRPC", aliases: ["grpc"] },
  // Leading edge keeps "example.net" out; ASP.NET / VB.NET still count.
  { canonical: ".NET", aliases: [/(?<![A-Za-z0-9])(?:asp|vb)?\.net(?![A-Za-z0-9])/i, "dotnet"] },
  { canonical: "Node.js", aliases: ["node\\.js", "nodejs", exact("Node")] },
  { canonical: "Microservices", aliases: ["microservices?"] },
  { canonical: "Authentication (JWT/OAuth)", aliases: ["jwts?", "oauth\\s?2?(?:\\.0)?", "firebase auth(?:entication)?"] },

  // Frontend
  { canonical: "React", aliases: ["react\\.js", "reactjs", exact("React(?!\\s+to\\b)")] },
  { canonical: "Next.js", aliases: ["next\\.js", "nextjs"] },
  { canonical: "Vite", aliases: ["vite"] },
  { canonical: "Tailwind CSS", aliases: ["tailwind(?:css)?"] },
  { canonical: "Angular", aliases: ["angular(?:js)?"] },
  { canonical: "Vue", aliases: ["vue\\.js", "vuejs", "vue"] },
  { canonical: "HTML/CSS", aliases: ["html5?", "css3?"] },

  // Data & Cloud
  { canonical: "PostgreSQL", aliases: ["postgres(?:ql)?"] },
  { canonical: "DuckDB", aliases: ["duckdb"] },
  { canonical: "SQLite", aliases: ["sqlite3?"] },
  { canonical: "MySQL", aliases: ["mysql"] },
  { canonical: "Oracle DB", aliases: ["oracle database", "oracle"] },
  { canonical: "MongoDB", aliases: ["mongodb", "mongo"] },
  { canonical: "Redis", aliases: ["redis"] },
  { canonical: "Snowflake", aliases: ["snowflake"] },
  { canonical: "AWS", aliases: ["aws", "amazon web services"] },
  { canonical: "GCP", aliases: ["gcp", "google cloud"] },
  { canonical: "Azure", aliases: ["azure"] },
  { canonical: "Docker", aliases: ["docker(?:ized|file)?"] },
  { canonical: "Kubernetes", aliases: ["kubernetes", "k8s"] },
  { canonical: "Terraform", aliases: ["terraform"] },
  { canonical: "CI/CD", aliases: ["ci/cd", "continuous integration", "continuous deployment"] },
  { canonical: "Git/GitHub", aliases: ["git", "github"] },
  { canonical: "Kafka", aliases: ["kafka"] },
  // Lowercase "airflow" is HVAC vocabulary (e.g. building-systems postings).
  { canonical: "Airflow", aliases: ["apache airflow", exact("Airflow")] },
  { canonical: "Spark", aliases: ["apache spark", "pyspark", exact("Spark")] },
  { canonical: "Parquet", aliases: ["parquet"] },

  // Engineering fundamentals
  { canonical: "Data structures & algorithms", aliases: ["data structures", "algorithms"] },
  { canonical: "Testing / unit tests", aliases: ["unit[- ]?test(?:s|ing)?", "test coverage", "tdd"] },
  { canonical: "System design", aliases: ["system design"] },
];

export interface SkillMatch {
  canonical: string;
  index: number;
}

const COMPILED = SKILL_DICTIONARY.map((entry) => ({
  canonical: entry.canonical,
  patterns: entry.aliases.map((a) => (typeof a === "string" ? new RegExp(`${B}(?:${a})${E}`, "i") : a)),
}));

/** Finds every dictionary skill mentioned in `text`, with the character offset of its first mention. */
export function extractSkills(text: string): SkillMatch[] {
  const matches: SkillMatch[] = [];
  for (const { canonical, patterns } of COMPILED) {
    for (const re of patterns) {
      const m = re.exec(text);
      if (m) {
        matches.push({ canonical, index: m.index });
        break;
      }
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}
