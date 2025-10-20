// Short, high-signal docs only (no examples)
export const KEYWORD_DOCS: Record<string, string> = {
    SELECT: "Retrieves data from one or more tables.",
    DISTINCT: "Removes duplicate rows from the result set.",
    FROM: "Specifies the source table(s) or table-valued functions.",
    WHERE: "Filters rows before grouping or aggregation.",
    "GROUP BY": "Groups rows that have the same values into summary rows.",
    HAVING: "Filters groups created by GROUP BY.",
    "ORDER BY": "Sorts the result set by one or more expressions.",
    JOIN: "Combines rows from two tables based on a related column.",
    "INNER JOIN": "Returns rows with matches in both tables.",
    "LEFT JOIN": "Returns all left table rows, and matched right rows.",
    "RIGHT JOIN": "Returns all right table rows, and matched left rows.",
    "FULL JOIN": "Returns rows when there is a match in either table.",
    "CROSS JOIN": "Returns the Cartesian product of two tables.",
    ON: "Specifies the join condition.",
    AS: "Assigns an alias to a table, column, or expression.",
    IN: "Checks if a value is within a list or subquery result.",
    BETWEEN: "Checks if a value is within a range (inclusive).",
    LIKE: "Pattern matching with wildcards (%, _).",
    EXISTS: "Checks if a subquery returns any rows."
};

// For quick lookup of multi-word variants we’ll check longest-first.
export const MULTIWORD_KEYWORDS = [
    "INNER JOIN",
    "LEFT JOIN",
    "RIGHT JOIN",
    "FULL JOIN",
    "CROSS JOIN",
    "GROUP BY",
    "ORDER BY"
];
