export type LanguageOptions = {
  frequent: LanguageOption[];
  others: LanguageOption[];
};

export type LanguageOption = {
  code: string;
  label: string;
};

// common languages first then alphabetical.
export const LANGUAGES: LanguageOptions = {
  frequent: [
    { code: "de", label: "German" },
    { code: "fr", label: "French" },
    { code: "it", label: "Italian" },
    { code: "en", label: "English" },
    { code: "tr", label: "Turkish" },
  ],
  others: [
    { code: "sq", label: "Albanian" },
    { code: "am", label: "Amharic" },
    { code: "ar", label: "Arabic" },
    { code: "bs", label: "Bosnian" },
    { code: "zh", label: "Chinese" },
    { code: "hr", label: "Croatian" },

    { code: "ku", label: "Kurdish" },
    { code: "ps", label: "Pashto" },
    { code: "fa", label: "Persian" },
    { code: "pl", label: "Polish" },
    { code: "pt", label: "Portuguese" },
    { code: "ro", label: "Romanian" },
    { code: "ru", label: "Russian" },
    { code: "sr", label: "Serbian" },
    { code: "so", label: "Somali" },
    { code: "es", label: "Spanish" },
    { code: "th", label: "Thai" },
    { code: "ti", label: "Tigrinya" },
    { code: "uk", label: "Ukrainian" },
    { code: "vi", label: "Vietnamese" },
  ],
};

export function languageLabel(code: string): string {
  const language = [...LANGUAGES.frequent, ...LANGUAGES.others].find(
    (option) => option.code === code,
  );

  return language?.label ?? code.toUpperCase();
}
