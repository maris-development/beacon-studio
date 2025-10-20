export type KeywordCase = "upper" | "lower" | "preserve";
export interface IntelliSenseOptions {
    keywordCase: KeywordCase;
}
export const DEFAULT_OPTIONS: Required<IntelliSenseOptions> = {
    keywordCase: "upper",
};
