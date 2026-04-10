import { describe, it, expect } from "vitest";
import { normalizeNumbersForSpeech } from "../normalize-numbers.js";

describe("normalizeNumbersForSpeech", () => {
  describe("currency", () => {
    it("converts $200,000 to spoken form", () => {
      expect(normalizeNumbersForSpeech("Worth $200,000 today.")).toBe(
        "Worth two hundred thousand dollars today."
      );
    });

    it("converts $5 (no comma) to spoken form", () => {
      expect(normalizeNumbersForSpeech("Costs $5.")).toBe(
        "Costs five dollars."
      );
    });

    it("converts $1.5 million with magnitude word", () => {
      expect(normalizeNumbersForSpeech("Raised $1.5 million.")).toBe(
        "Raised one point five million dollars."
      );
    });

    it("converts $2 billion with magnitude word", () => {
      expect(normalizeNumbersForSpeech("$2 billion valuation.")).toBe(
        "two billion dollars valuation."
      );
    });

    it("converts $1,234,567 with multiple commas", () => {
      expect(normalizeNumbersForSpeech("Profit: $1,234,567")).toBe(
        "Profit: one million two hundred thirty four thousand five hundred sixty seven dollars"
      );
    });

    it("converts $3.99 decimal currency", () => {
      expect(normalizeNumbersForSpeech("Just $3.99 a month.")).toBe(
        "Just three point nine nine dollars a month."
      );
    });
  });

  describe("percentages", () => {
    it("converts 5%", () => {
      expect(normalizeNumbersForSpeech("Up 5%.")).toBe("Up five percent.");
    });

    it("converts 2.5%", () => {
      expect(normalizeNumbersForSpeech("Rate is 2.5%.")).toBe(
        "Rate is two point five percent."
      );
    });

    it("converts 100%", () => {
      expect(normalizeNumbersForSpeech("100% guaranteed.")).toBe(
        "one hundred percent guaranteed."
      );
    });
  });

  describe("multipliers", () => {
    it("converts 10x", () => {
      expect(normalizeNumbersForSpeech("10x growth.")).toBe("ten times growth.");
    });

    it("converts 2.5x", () => {
      expect(normalizeNumbersForSpeech("2.5x faster.")).toBe(
        "two point five times faster."
      );
    });
  });

  describe("ordinals", () => {
    it("converts 1st, 2nd, 3rd", () => {
      expect(normalizeNumbersForSpeech("1st place beats 2nd and 3rd.")).toBe(
        "first place beats second and third."
      );
    });

    it("converts 21st", () => {
      expect(normalizeNumbersForSpeech("The 21st century.")).toBe(
        "The twenty first century."
      );
    });
  });

  describe("years", () => {
    it("converts 2024 to twenty twenty four", () => {
      expect(normalizeNumbersForSpeech("Back in 2024.")).toBe(
        "Back in twenty twenty four."
      );
    });

    it("converts 1999 to nineteen ninety nine", () => {
      expect(normalizeNumbersForSpeech("Since 1999.")).toBe(
        "Since nineteen ninety nine."
      );
    });

    it("converts 2005 to two thousand five", () => {
      expect(normalizeNumbersForSpeech("Founded in 2005.")).toBe(
        "Founded in two thousand five."
      );
    });

    it("converts 1901 to nineteen oh one", () => {
      expect(normalizeNumbersForSpeech("Year 1901.")).toBe(
        "Year nineteen oh one."
      );
    });

    it("converts 2000 to two thousand", () => {
      expect(normalizeNumbersForSpeech("In 2000.")).toBe("In two thousand.");
    });
  });

  describe("comma-grouped numbers", () => {
    it("converts 1,000", () => {
      expect(normalizeNumbersForSpeech("1,000 users.")).toBe(
        "one thousand users."
      );
    });

    it("converts 50,000", () => {
      expect(normalizeNumbersForSpeech("50,000 subscribers.")).toBe(
        "fifty thousand subscribers."
      );
    });
  });

  describe("decimals", () => {
    it("converts 3.14", () => {
      expect(normalizeNumbersForSpeech("Pi is 3.14.")).toBe(
        "Pi is three point one four."
      );
    });
  });

  describe("bare integers", () => {
    it("converts small numbers", () => {
      expect(normalizeNumbersForSpeech("Just 42 things.")).toBe(
        "Just forty two things."
      );
    });

    it("converts zero", () => {
      expect(normalizeNumbersForSpeech("0 risk.")).toBe("zero risk.");
    });
  });

  describe("mixed", () => {
    it("handles a realistic finance script line", () => {
      expect(
        normalizeNumbersForSpeech(
          "In 2024, Apple made $200,000 in revenue, growing 15% with 3.2x margins."
        )
      ).toBe(
        "In twenty twenty four, Apple made two hundred thousand dollars in revenue, growing fifteen percent with three point two times margins."
      );
    });

    it("leaves text without numbers untouched", () => {
      expect(normalizeNumbersForSpeech("Hello world!")).toBe("Hello world!");
    });
  });
});
