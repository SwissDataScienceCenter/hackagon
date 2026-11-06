Drag people from Unassigned onto a team, or plan in the spreadsheet.

Nothing changes until you Save. Saving deletes teams with nobody in them.

Once a team has a submission or teams are published, teams are fixed. Uploading
and deleting teams are off then. Moving people, renaming and adding teams still
work.

### Spreadsheet

1. **Download CSV.** One row per participant, with their current project and
   team, or empty if they have no team yet.
2. **Correct the `project` and `team` columns.** Keep every row and leave
   `user_id` as it is. Other columns are ignored.
3. **Upload CSV.** It replaces all teams. Check the result, then Save.

What the columns accept:

- **`project`**: a project number, as shown here and in the prefers column.
  Anything else is an incomplete assignment.
- **`team`**: any name, even a single character. It can be renamed after upload.
- **Both empty**: the person ends up unassigned.
- **An incomplete assignment**: a warning, and the person ends up unassigned.
- **A row missing**: a warning, and the person ends up unassigned.
