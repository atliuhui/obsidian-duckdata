# Copilot Instructions

## Language Rule

**English is the primary language for this project. All documentation, comments, and code strings MUST be in English.**

This includes:
- Code comments and docstrings
- Commit messages
- README files and markdown documentation
- UI strings and error messages
- Git branch names (use kebab-case)

## Git Commit Rule

**IMPORTANT: Do NOT auto-commit or stage any changes. After code modifications are complete, leave files unstaged. Let the user manually review, stage, and commit changes.**

This prevents:
- Staging files before the user has reviewed them
- Accidentally including unrelated or unwanted changes
- Duplicate commit records for the same feature
- Messy commit history from poor timing
- Unnecessary intermediate commits

### Correct Workflow
1. Complete code changes
2. Leave changed files unstaged
3. Wait for user to manually review changes
4. User manually executes `git add`
5. User manually executes `git commit -m "<message>"`
6. User optionally executes `git push`
