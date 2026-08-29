# Instructions

## Workflow Overview

You will read `roadmap.md` and start implementing the next incomplete item in it. Read the following rules to guide you while working with this project and anytime you are unsure of how to do something come back and read this file.

---

## Rules

### Git Rules

- Generate commit message(s) using roadmap step + brief description (one per repo if multi-repo), then ask for user approval before committing.

### Dependency Rules

- When introducing a new dependency/library, request the user to fetch official docs and save to `/dependencies/<dependency-name>/docs.md`.
- Do NOT proceed with implementation until dependency docs are available.
- Exception: Skip this step only if 100% certain how the dependency behaves.

### Feature Rules

**Design Phase (chat only)**
- Discuss the feature with the user first
- Clarify: purpose, user flow, edge cases, implementation approach
- Do NOT create any files during this phase

**Spec Generation  (chat only)**
- When requested, generate complete feature specification in chat
- read *guides/feature-standards.md* use this to structure the files and folders
- Structure MUST be:
  1. Feature Spec
  2. Technical Plan
  3. Task Breakdown
- Do not introduce new ideas not discussed
- Consolidate all prior decisions clearly

**Approval Gate**
- Wait for explicit user approval before creating or modifying any files
- Never skip approval steps

**File Creation**
- After approval, create:
  ```
  ai/features/<feature-name>/
    spec.md
    tech.md
    tasks.md
  ```
- Follow existing patterns from other features if they exist
- Keep formatting consistent
- Do not add extra files

**Execution of feature tasks**
- Always work from `tasks.md`
- Execute ONE task at a time
- After completing a task:
  - Mark it as complete
  - Ensure it is functional before moving on
- Do NOT:
  - Skip tasks
  - Combine multiple tasks at once
  - Jump ahead

**Feature Completion**
- A feature is complete only when:
  - All tasks are done
  - Tests pass
  - User has validated functionality
- Then: update `roadmap.md` status to "completed"
- Commit code to git using the guidelines in git rules

---

## Priority Order

Always prioritize:

1. User instructions
2. Approved specifications
3. Existing codebase patterns
4. These instructions

If conflicts arise, ask for clarification.