export interface SkillEntry {
  canonical: string;
  aliases: string[];
}

// Canonical skill list = Mikael's actual inventory (CLAUDE_MEMORY_JOB_SEARCH.md section 7)
// plus common adjacent/competing technologies, so gap analysis can surface
// things he genuinely doesn't have yet, not just things he does.
export const SKILL_DICTIONARY: SkillEntry[] = [
  // AI & ML
  { canonical: "LLM integration", aliases: ["llm integration", "large language model", "llm-powered", "llm powered"] },
  { canonical: "OpenAI API", aliases: ["openai api", "openai"] },
  { canonical: "Prompt engineering", aliases: ["prompt engineering"] },
  { canonical: "Agentic workflows", aliases: ["agentic", "ai agents", "tool-using agents", "tool calling"] },
  { canonical: "RAG", aliases: ["rag", "retrieval augmented generation", "retrieval-augmented generation"] },
  { canonical: "NL-to-SQL", aliases: ["natural language to sql", "nl2sql", "nl-to-sql", "text-to-sql"] },
  { canonical: "BERT / NLP", aliases: ["bert", "nlp", "text classification"] },
  { canonical: "scikit-learn", aliases: ["scikit-learn", "sklearn"] },
  { canonical: "Pandas", aliases: ["pandas"] },
  { canonical: "NumPy", aliases: ["numpy"] },
  { canonical: "PyTorch", aliases: ["pytorch", "torch"] },
  { canonical: "TensorFlow", aliases: ["tensorflow"] },
  { canonical: "LangChain", aliases: ["langchain"] },
  { canonical: "Vector databases", aliases: ["vector database", "pinecone", "weaviate", "chroma", "pgvector"] },

  // Languages
  { canonical: "Python", aliases: ["python"] },
  { canonical: "SQL", aliases: ["sql"] },
  { canonical: "TypeScript", aliases: ["typescript", "ts"] },
  { canonical: "JavaScript", aliases: ["javascript", "js"] },
  { canonical: "C", aliases: ["\\bc\\b"] },
  { canonical: "C++", aliases: ["c\\+\\+", "cpp"] },
  { canonical: "Java", aliases: ["\\bjava\\b"] },
  { canonical: "Go", aliases: ["\\bgolang\\b", "\\bgo\\b"] },
  { canonical: "Rust", aliases: ["\\brust\\b"] },

  // Backend & APIs
  { canonical: "FastAPI", aliases: ["fastapi"] },
  { canonical: "Flask", aliases: ["flask"] },
  { canonical: "Django", aliases: ["django"] },
  { canonical: "REST APIs", aliases: ["rest api", "restful api"] },
  { canonical: "GraphQL", aliases: ["graphql"] },
  { canonical: "gRPC", aliases: ["grpc"] },
  { canonical: "Node.js", aliases: ["node\\.js", "nodejs", "\\bnode\\b"] },
  { canonical: "Microservices", aliases: ["microservice"] },
  { canonical: "Authentication (JWT/OAuth)", aliases: ["\\bjwt\\b", "oauth", "firebase auth"] },

  // Frontend
  { canonical: "React", aliases: ["react\\.js", "reactjs", "\\breact\\b"] },
  { canonical: "Next.js", aliases: ["next\\.js", "nextjs"] },
  { canonical: "Vite", aliases: ["\\bvite\\b"] },
  { canonical: "Tailwind CSS", aliases: ["tailwind"] },
  { canonical: "Angular", aliases: ["angular"] },
  { canonical: "Vue", aliases: ["vue\\.js", "vuejs", "\\bvue\\b"] },
  { canonical: "HTML/CSS", aliases: ["html", "\\bcss\\b"] },

  // Data & Cloud
  { canonical: "PostgreSQL", aliases: ["postgresql", "postgres"] },
  { canonical: "DuckDB", aliases: ["duckdb"] },
  { canonical: "SQLite", aliases: ["sqlite"] },
  { canonical: "MySQL", aliases: ["mysql"] },
  { canonical: "Oracle DB", aliases: ["oracle database", "\\boracle\\b"] },
  { canonical: "MongoDB", aliases: ["mongodb", "\\bmongo\\b"] },
  { canonical: "Redis", aliases: ["redis"] },
  { canonical: "Snowflake", aliases: ["snowflake"] },
  { canonical: "AWS", aliases: ["\\baws\\b", "amazon web services"] },
  { canonical: "GCP", aliases: ["\\bgcp\\b", "google cloud"] },
  { canonical: "Azure", aliases: ["\\bazure\\b"] },
  { canonical: "Docker", aliases: ["docker"] },
  { canonical: "Kubernetes", aliases: ["kubernetes", "\\bk8s\\b"] },
  { canonical: "Terraform", aliases: ["terraform"] },
  { canonical: "CI/CD", aliases: ["ci/cd", "continuous integration", "continuous deployment"] },
  { canonical: "Git/GitHub", aliases: ["\\bgit\\b", "github"] },
  { canonical: "Kafka", aliases: ["kafka"] },
  { canonical: "Airflow", aliases: ["airflow"] },
  { canonical: "Spark", aliases: ["apache spark", "\\bspark\\b"] },
  { canonical: "Parquet", aliases: ["parquet"] },

  // Engineering fundamentals
  { canonical: "Data structures & algorithms", aliases: ["data structures", "algorithms"] },
  { canonical: "Testing / unit tests", aliases: ["unit test", "test coverage", "\\btdd\\b"] },
  { canonical: "System design", aliases: ["system design"] },
];

export interface SkillMatch {
  canonical: string;
  index: number;
}

/** Finds every dictionary skill mentioned in `text`, with the character offset of its first mention. */
export function extractSkills(text: string): SkillMatch[] {
  const matches: SkillMatch[] = [];
  for (const entry of SKILL_DICTIONARY) {
    for (const alias of entry.aliases) {
      const re = new RegExp(alias, "i");
      const m = re.exec(text);
      if (m) {
        matches.push({ canonical: entry.canonical, index: m.index });
        break;
      }
    }
  }
  return matches.sort((a, b) => a.index - b.index);
}
