/**
 * Deterministic English-language guard for job content.
 *
 * Job boards are not language-scoped: Arbeitnow, Adzuna and Jooble regularly
 * return postings in German, French, Spanish, etc. This module keeps the
 * product English-only without changing source data or calling an external
 * language-detection API.
 *
 * The heuristic is intentionally conservative:
 * - obvious non-Latin scripts are rejected immediately
 * - a broad set of non-English function words is counted
 * - short/technical descriptions default to English so we never hide a valid
 *   English role just because it has no prose.
 */

const ENGLISH_WORDS = new Set([
  "a", "about", "above", "after", "again", "against", "all", "also", "am",
  "an", "and", "any", "are", "as", "at", "be", "because", "been", "before",
  "being", "below", "between", "both", "but", "by", "can", "could", "did",
  "do", "does", "doing", "down", "during", "each", "few", "for", "from",
  "further", "had", "has", "have", "having", "he", "her", "here", "hers",
  "herself", "him", "himself", "his", "how", "i", "if", "in", "into", "is",
  "it", "its", "itself", "just", "me", "more", "most", "my", "myself", "no",
  "nor", "not", "now", "of", "off", "on", "once", "only", "or", "other",
  "our", "ours", "ourselves", "out", "over", "own", "same", "she", "should",
  "so", "some", "such", "than", "that", "the", "their", "theirs", "them",
  "themselves", "then", "there", "these", "they", "this", "those", "through",
  "to", "too", "under", "until", "up", "very", "was", "we", "were", "what",
  "when", "where", "which", "while", "who", "whom", "why", "will", "with",
  "would", "you", "your", "yours", "yourself", "yourselves",
]);

const NON_ENGLISH_WORDS = new Set([
  // German
  "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "eines",
  "einem", "einen", "und", "oder", "aber", "mit", "für", "von", "vom", "im",
  "am", "auf", "aus", "bei", "nach", "über", "unter", "vor", "zu", "zum",
  "zur", "ist", "sind", "war", "waren", "werden", "wird", "haben", "hat",
  "wir", "ihr", "sie", "uns", "unser", "unsere", "unserem", "unseren",
  "dein", "deine", "deinem", "deinen", "du", "nicht", "kein", "keine", "als",
  "auch", "dass", "sich", "seit", "zwischen", "durch", "gegen", "ohne", "um",
  "aufgaben", "profil", "kenntnisse", "erfahrung", "stelle", "vollzeit",
  "teilzeit", "standort", "bewerbung", "voraussetzungen", "verantwortung",
  "entwicklung", "mitarbeiter", "möglichkeiten", "arbeitszeiten", "homeoffice",
  "unternehmen", "ansprechpartner", "leistungen", "gehalt", "vertrag",
  // French
  "le", "la", "les", "un", "une", "des", "du", "de", "et", "ou", "mais",
  "pour", "par", "avec", "sans", "dans", "sur", "sous", "entre", "vers",
  "chez", "est", "sont", "être", "avons", "avez", "ont", "nous", "vous",
  "ils", "elles", "je", "tu", "il", "elle", "ce", "cette", "ces", "qui",
  "que", "quoi", "dont", "où", "au", "aux", "ne", "pas", "plus", "comme",
  "tout", "tous", "votre", "notre", "nos", "vos", "leurs", "poste",
  "missions", "recherchons", "recherché", "compétences", "expérience",
  "équipe", "entreprise", "candidat", "offre", "contrat", "salaire",
  "avantages", "lieu", "rejoindre", "participer", "assurer",
  // Spanish
  "el", "los", "las", "unos", "unas", "del", "y", "o", "pero", "para",
  "por", "con", "sin", "en", "sobre", "hacia", "desde", "hasta", "es",
  "son", "ser", "está", "están", "estamos", "tenemos", "tiene", "han", "ha",
  "hemos", "nosotros", "vosotros", "ellos", "ellas", "yo", "tú", "él", "ella",
  "quien", "como", "donde", "cuando", "su", "sus", "nuestro", "nuestra",
  "tus", "más", "puesto", "funciones", "perfil", "buscamos", "competencias",
  "experiencia", "equipo", "empresa", "candidato", "oferta", "contrato",
  "salario", "beneficios", "ubicación", "incorporación", "requisitos",
  "responsabilidades",
  // Portuguese
  "os", "as", "uns", "umas", "do", "da", "dos", "das", "e", "ou", "mas",
  "sem", "em", "no", "na", "nos", "nas", "até", "é", "são", "está", "estão",
  "temos", "tem", "há", "nós", "vós", "ele", "ela", "seu", "sua", "seus",
  "suas", "nosso", "nossa", "não", "vaga", "funções", "perfil",
  "procuramos", "competências", "experiência", "equipe", "empresa",
  "candidato", "oferta", "contrato", "salário", "benefícios", "local",
  // Dutch
  "het", "een", "of", "voor", "door", "zonder", "op", "aan", "bij", "van",
  "naar", "onder", "tussen", "tot", "uit", "zijn", "was", "waren", "worden",
  "wordt", "hebben", "heeft", "wij", "jullie", "zij", "ons", "onze", "jouw",
  "je", "geen", "dit", "deze", "als", "ook", "dan", "om", "functie",
  "werkzaamheden", "profiel", "zoeken", "ervaring", "vaardigheden",
  "team", "bedrijf", "kandidaat", "aanbod", "contract", "salaris",
  // Italian
  "lo", "gli", "uno", "di", "della", "dei", "delle", "senza", "su", "tra",
  "fra", "verso", "fino", "è", "sono", "essere", "siamo", "hanno", "noi",
  "voi", "loro", "io", "lui", "lei", "chi", "dove", "quando", "suo", "sua",
  "nostri", "vostro", "più", "non", "posizione", "mansioni", "profilo",
  "cerchiamo", "competenze", "esperienza", "squadra", "azienda", "candidato",
  "offerta", "contratto", "stipendio", "benefici", "luogo",
  // Polish
  "w", "na", "z", "do", "że", "jest", "są", "nie", "dla", "oraz", "się",
  "od", "po", "pod", "nad", "przez", "przy", "bez", "ale", "lub", "czy",
  "jak", "tak", "ten", "ta", "te", "jego", "jej", "ich", "nasz", "wasz",
  "który", "która", "które", "może", "można", "będzie", "być", "ma", "mają",
  "stanowisko", "zadania", "profil", "szukamy", "umiejętności",
  "doświadczenie", "zespół", "firma", "kandydat", "oferta", "umowa",
  // Czech
  "v", "s", "že", "je", "jsou", "není", "pro", "se", "přes", "při", "bez",
  "nebo", "ten", "ty", "jeho", "její", "jejich", "náš", "váš", "který",
  "může", "bude", "být", "má", "mají", "pozice", "úkoly", "profil",
  "hledáme", "dovednosti", "zkušenosti", "tým", "společnost", "kandidát",
  "nabídka", "smlouva",
  // Hungarian
  "az", "és", "vagy", "de", "hogy", "nem", "is", "már", "még", "csak",
  "mint", "ha", "meg", "el", "be", "ki", "fel", "le", "át", "alatt",
  "fölött", "mellett", "között", "után", "előtt", "által", "szerint",
  "nélkül", "van", "volt", "lesz", "vagyok", "vagyunk", "vannak", "kell",
  "lehet", "ez", "ezek", "azok", "amely", "aki", "ami", "pozíció",
  "feladatok", "profil", "keresünk", "készségek", "tapasztalat", "csapat",
  "vállalat", "jelölt", "ajánlat", "szerződés",
  // Romanian
  "și", "sau", "dar", "pentru", "cu", "fără", "în", "pe", "la", "din",
  "prin", "între", "până", "spre", "este", "sunt", "fi", "avem", "au",
  "noi", "voi", "ei", "eu", "tu", "el", "ea", "care", "ce", "cum", "unde",
  "când", "său", "sa", "săi", "nostru", "vostru", "mai", "nu", "post",
  "atribuții", "profil", "căutăm", "competențe", "experiență", "echipă",
  "companie", "candidat", "ofertă", "contract",
  // Swedish / Norwegian / Danish
  "och", "eller", "men", "för", "med", "utan", "på", "till", "från", "av",
  "över", "under", "mellan", "genom", "vid", "hos", "är", "var", "vara",
  "blir", "har", "hade", "vi", "ni", "de", "oss", "vår", "vårt", "våra",
  "din", "dina", "inte", "ingen", "att", "som", "detta", "den", "det",
  "kan", "ska", "vill", "og", "er", "bliver", "dere", "vores", "ikke",
  "ingen", "at", "dette", "skal", "vil", "tjeneste", "ansvar", "profil",
  "søker", "erfaring", "ferdigheter", "team", "selskap", "kandidat",
  "tilbud", "kontrakt",
  // Finnish
  "ja", "tai", "mutta", "varten", "kanssa", "ilman", "on", "ovat", "ei",
  "me", "te", "he", "se", "tämä", "että", "kun", "jos", "kuin", "myös",
  "voi", "pitää", "tehtävä", "vastuu", "profiili", "etsimme", "osaaminen",
  "kokemus", "tiimi", "yritys", "ehdokas", "tarjous", "sopimus",
  // Turkish
  "ve", "veya", "ama", "için", "ile", "olmadan", "içinde", "üzerinde",
  "altında", "arasında", "tarafından", "göre", "kadar", "gibi", "olarak",
  "var", "yok", "olan", "bu", "şu", "biz", "siz", "onlar", "ben", "sen",
  "bir", "çok", "daha", "en", "de", "da", "mi", "mı", "değil", "pozisyon",
  "görevler", "profil", "arıyoruz", "beceriler", "deneyim", "ekip",
  "şirket", "aday", "teklif", "sözleşme",
  // Indonesian / Malay
  "dan", "atau", "tetapi", "untuk", "dengan", "tanpa", "di", "ke", "dari",
  "pada", "atas", "bawah", "antara", "melalui", "oleh", "adalah", "akan",
  "sudah", "belum", "kami", "kita", "mereka", "saya", "kamu", "ini", "itu",
  "yang", "tidak", "bisa", "harus", "juga", "posisi", "tugas", "profil",
  "mencari", "keterampilan", "pengalaman", "tim", "perusahaan", "kandidat",
  "penawaran", "kontrak",
]);

/**
 * Words that exist in both English and another language (or are common enough
 * in English prose/names) must never count as foreign evidence. Without this,
 * an English posting using "team", "contract", "at", "under", "on", etc.
 * hundreds of times could be misclassified.
 */
const ENGLISH_LOOKALIKES = new Set([
  "a", "am", "as", "at", "be", "care", "contract", "de", "den", "des",
  "die", "do", "door", "du", "e", "el", "en", "et", "ha", "hat", "he", "i",
  "is", "la", "le", "les", "ma", "me", "men", "mint", "no", "o", "of",
  "on", "post", "plus", "pro", "se", "sin", "son", "ta", "te", "team",
  "ten", "ty", "um", "un", "under", "une", "van", "war", "was", "y",
]);

const FOREIGN_WORDS = new Set(
  [...NON_ENGLISH_WORDS].filter(
    (word) => !ENGLISH_WORDS.has(word) && !ENGLISH_LOOKALIKES.has(word),
  ),
);

const NON_LATIN_SCRIPT =
  /[\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u0900-\u097F\u0E00-\u0E7F\u1100-\u11FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/u;

const ACCENTED_LATIN = /[\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF\u0100-\u017F\u1E00-\u1EFF]/u;

function stripMarkup(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\S+@\S+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countHits(tokens: string[], words: Set<string>): number {
  let hits = 0;
  for (const token of tokens) {
    if (words.has(token)) hits += 1;
  }
  return hits;
}

/**
 * Returns true when the posting is English (or too short/ambiguous to safely
 * reject). False means the listing should be filtered out.
 */
export function isLikelyEnglish(
  title: string | null | undefined,
  description: string | null | undefined,
): boolean {
  const text = stripMarkup(`${title ?? ""} ${description ?? ""}`);
  if (!text) return false;

  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 20) return true;

  let nonLatin = 0;
  let accented = 0;
  for (const letter of letters) {
    if (NON_LATIN_SCRIPT.test(letter)) nonLatin += 1;
    else if (ACCENTED_LATIN.test(letter)) accented += 1;
  }

  // CJK, Cyrillic, Arabic, Hebrew, Greek, Thai, Devanagari, Hangul, etc.
  if (nonLatin / letters.length > 0.12) return false;

  const tokens = text.toLowerCase().match(/\p{L}+/gu) ?? [];
  if (tokens.length < 6) return true;

  const englishHits = countHits(tokens, ENGLISH_WORDS);
  const foreignHits = countHits(tokens, FOREIGN_WORDS);

  // A small amount of foreign vocabulary in an English posting is normal
  // (company names, locations, role titles). Require a meaningful signal.
  if (foreignHits >= 3 && foreignHits > englishHits) return false;
  if (foreignHits >= 2 && englishHits === 0) return false;

  // Heavily accented Latin text plus at least one foreign function word is
  // almost always a non-English posting.
  if (accented / letters.length > 0.045 && foreignHits >= 1) return false;

  return true;
}
