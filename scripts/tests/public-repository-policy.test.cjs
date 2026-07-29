const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "../..");
const policy = JSON.parse(
  fs.readFileSync(path.join(root, "scripts/public-content-policy.json"), "utf8"),
);
const tracked = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  {
  cwd: root,
  encoding: "utf8",
  },
)
  .split("\0")
  .filter(Boolean);

const textFiles = tracked.filter((relativePath) => {
  if (!fs.existsSync(path.join(root, relativePath))) {
    return false;
  }
  if (policy.excludedFiles.includes(relativePath)) {
    return false;
  }
  if (policy.excludedPaths.some((prefix) => relativePath.startsWith(prefix))) {
    return false;
  }
  if (relativePath.endsWith("package-lock.json")) {
    return false;
  }
  return policy.textExtensions.includes(path.extname(relativePath).toLowerCase());
});

test("tracked public text contains no obsolete delivery language", () => {
  const violations = [];

  for (const relativePath of textFiles) {
    const content = fs.readFileSync(path.join(root, relativePath), "utf8");
    for (const pattern of policy.forbiddenPatterns) {
      if (new RegExp(pattern, "iu").test(content)) {
        violations.push(`${relativePath}: ${pattern}`);
      }
    }
  }

  assert.deepEqual(violations, []);
});

test("obsolete public paths are absent", () => {
  for (const relativePath of policy.removedPaths) {
    const hasPublicFile = tracked.some((candidate) => {
      const candidatePath = path.join(root, candidate);
      return (
        fs.existsSync(candidatePath) &&
        (candidate === relativePath || candidate.startsWith(`${relativePath}/`))
      );
    });
    assert.equal(hasPublicFile, false, relativePath);
  }
});

test("tracked text contains no common private credential material", () => {
  const secretPattern =
    /(BEGIN (RSA|OPENSSH|EC) PRIVATE KEY|ghp_[A-Za-z0-9]{30,}|AKIA[0-9A-Z]{16})/;
  const violations = textFiles.filter((relativePath) =>
    secretPattern.test(fs.readFileSync(path.join(root, relativePath), "utf8")),
  );

  assert.deepEqual(violations, []);
});

test("bilingual readmes describe the product and open-source workflow", () => {
  for (const readme of ["README.md", "README.en.md"]) {
    const content = fs.readFileSync(path.join(root, readme), "utf8");
    assert.match(content, /Android/);
    assert.match(content, /services\/backend/);
    assert.match(content, /CONTRIBUTING\.md/);
    assert.match(content, /SECURITY\.md/);
    assert.match(content, /MIT/);
  }
});

test("open-source governance files are present", () => {
  for (const relativePath of [
    "CONTRIBUTING.md",
    "CODE_OF_CONDUCT.md",
    "SECURITY.md",
    "SUPPORT.md",
    "CHANGELOG.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml",
    ".github/ISSUE_TEMPLATE/config.yml",
    ".github/pull_request_template.md",
    ".github/dependabot.yml",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, relativePath);
  }
});

test("self-hosted backend delivery files are present", () => {
  for (const relativePath of [
    "services/backend/Dockerfile",
    "services/backend/.dockerignore",
    "compose.yml",
    ".env.example",
    ".github/workflows/ci.yml",
  ]) {
    assert.equal(fs.existsSync(path.join(root, relativePath)), true, relativePath);
  }
});
