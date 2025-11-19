# Agent Git Worktree Workflow

This document outlines the standard operating procedure for AI agents working on this repository. The goal is to isolate agent changes in a separate git worktree and branch, allowing for parallel work and clean Pull Requests.

## Workflow Instructions

When starting a new conversation or task:

1.  **Identify/Create Worktree**:
    *   Check if a dedicated worktree exists (e.g., `../openhouse-conversation` or `../<repo_name>-agent`).
    *   If it does not exist, create it:
        ```bash
        git worktree add -b agent/<topic> ../<repo_name>-agent master
        ```
    *   If it exists, ensure it is clean or create a new branch from master:
        ```bash
        cd ../<repo_name>-agent
        git checkout master
        git pull
        git checkout -b agent/<topic>
        ```

2.  **Perform Work in Worktree**:
    *   **Crucial**: All file edits (`write_to_file`, `replace_file_content`) and terminal commands (`run_command`) must be executed within the worktree directory (e.g., `/path/to/openhouse-conversation`).
    *   Do not modify files in the main checkout unless explicitly instructed.

3.  **Commit and Push**:
    *   Once a logical unit of work is complete:
        ```bash
        git add .
        git commit -m "feat: <description of changes>"
        git push origin agent/<topic>
        ```
    *   Inform the user that the branch has been pushed and is ready for a PR.

## Example Prompt

To initiate this workflow, the user can provide a prompt like:

> "Please switch to the agent worktree, create a new branch for <topic>, and implement <request>."

## Benefits

*   **Isolation**: Agent changes do not interfere with the user's current working directory.
*   **Parallelism**: User can continue working on `master` or another feature while the agent works on a separate branch.
*   **Review**: All agent changes are submitted via PR, ensuring code review quality.
