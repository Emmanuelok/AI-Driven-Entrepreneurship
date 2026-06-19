import { describe, it, expect } from "vitest";
import { parseInstitutionEmail, inferLabel } from "./institution-email";

describe("parseInstitutionEmail", () => {
  it("accepts .edu", () => {
    const r = parseInstitutionEmail("a@stanford.edu");
    expect(r.ok).toBe(true);
    expect(r.domain).toBe("stanford.edu");
    expect(r.inferredLabel).toBe("STANFORD");
  });

  it("accepts .ac.uk + subdomain", () => {
    const r = parseInstitutionEmail("Jane@dpmms.cam.ac.uk");
    expect(r.ok).toBe(true);
    expect(r.inferredLabel).toBe("CAM");
  });

  it("accepts African academic TLDs", () => {
    expect(parseInstitutionEmail("a@knust.edu.gh").inferredLabel).toBe("KNUST");
    expect(parseInstitutionEmail("a@uct.ac.za").inferredLabel).toBe("UCT");
    expect(parseInstitutionEmail("a@unilag.edu.ng").inferredLabel).toBe("UNILAG");
    expect(parseInstitutionEmail("a@cs.makerere.ac.ug").inferredLabel).toBe("MAKERERE");
  });

  it("rejects personal email providers", () => {
    expect(parseInstitutionEmail("a@gmail.com").reason).toBe("personal_provider");
    expect(parseInstitutionEmail("a@yahoo.co.uk").reason).toBe("personal_provider");
    expect(parseInstitutionEmail("a@hotmail.com").reason).toBe("personal_provider");
  });

  it("rejects disposable inboxes", () => {
    expect(parseInstitutionEmail("burn@mailinator.com").reason).toBe("disposable");
    expect(parseInstitutionEmail("a@10minutemail.com").reason).toBe("disposable");
  });

  it("rejects non-institutional domains", () => {
    expect(parseInstitutionEmail("a@randomsite.co").reason).toBe("not_institutional");
    expect(parseInstitutionEmail("a@example.net").reason).toBe("not_institutional");
  });

  it("rejects malformed input", () => {
    expect(parseInstitutionEmail("notanemail").reason).toBe("invalid_shape");
    expect(parseInstitutionEmail("").reason).toBe("invalid_shape");
    expect(parseInstitutionEmail("a@b").reason).toBe("invalid_shape");
  });

  it("normalizes case and whitespace", () => {
    const r = parseInstitutionEmail("  STUDENT@KNUST.EDU.GH  ");
    expect(r.email).toBe("student@knust.edu.gh");
    expect(r.ok).toBe(true);
  });

  it("accepts .gov for public-sector accounts", () => {
    const r = parseInstitutionEmail("a@nih.gov");
    expect(r.ok).toBe(true);
    expect(r.inferredLabel).toBe("NIH");
  });
});

describe("inferLabel", () => {
  it("strips edu/ac/gov + 2-letter ccTLD", () => {
    expect(inferLabel("knust.edu.gh")).toBe("KNUST");
    expect(inferLabel("imperial.ac.uk")).toBe("IMPERIAL");
    expect(inferLabel("nih.gov")).toBe("NIH");
  });

  it("returns the deepest informative label when there are subdomains", () => {
    // dpmms is a department, cambridge is the institution
    expect(inferLabel("dpmms.cam.ac.uk")).toBe("CAM");
  });

  it("keeps the last surviving label even for pathological domains", () => {
    // "co.uk" isn't institutional and would be rejected upstream;
    // inferLabel just needs to not crash and to return *something*.
    // "co" stays after stripping the 2-letter ccTLD because the loop
    // requires more than one remaining part to keep stripping.
    expect(inferLabel("co.uk")).toBe("CO");
    expect(inferLabel("")).toBe("");
  });
});
