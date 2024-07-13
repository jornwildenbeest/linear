import fetch from "node-fetch";
import { GITLAB_ISSUE, Note } from "./GitlabImporter";

const GITLAB_API = "https://git.niice.nl/api/v4";

export const gitlabClient = (apiKey: string) => {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  return async (path: string, method: string, body?: never) => {
    const headers = {
      "Content-Type": "application/json",
      "PRIVATE-TOKEN": apiKey,
    };

    const response = await fetch(`${GITLAB_API}/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (response.status === 401) {
      throw new Error("Invalid API key");
    }

    if (response.status === 404) {
      throw new Error("Not found");
    }

    if (response.status !== 200) {
      throw new Error(`Unexpected status code: ${response.status}`);
    }

    return response.json();
  };
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getGitlabProjectId = (apiKey: string, projectName: string) => {
  return gitlabClient(apiKey)("projects?per_page=100&search=" + projectName, "GET")
    .then(projects => {
      // eslint-disable-next-line @typescript-eslint/no-shadow
      const { id } = projects.find((project: { path: string }) => project.path === projectName);

      if (!id) {
        throw new Error(`Project ${projectName} not found`);
      }

      return id;
    })
    .catch(error => {
      throw new Error(`Failed to get project: ${error.message}`);
    });
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getGitlabIssuesFromRepo = async (apiKey: string, projectId: number, projectName: string) => {
  const issues = await gitlabClient(apiKey)(`projects/${projectId}/issues?state=opened`, "GET")
    .then(issueList =>
      issueList.map((issue: GITLAB_ISSUE) => ({
        id: issue.id,
        iid: issue.iid,
        title: issue.title,
        description: issue.description,
        labels: issue.labels,
        assignees: issue.assignees,
        due_date: issue.due_date,
        severity: issue.severity,
        web_url: issue.web_url,
        created_at: issue.created_at,
        state: issue.state,
      }))
    )
    .catch(error => {
      throw new Error(`Failed to get issues: ${error.message}`);
    });

  // Fetching comments of issues.
  for (const issue of issues) {
    issue.comments = await gitlabClient(apiKey)(
      `/projects/${projectId}/issues/${issue.iid}/notes?sort=asc&order_by=updated_at`,
      "GET"
    )
      .then(notes =>
        notes
          .filter((note: Note) => !note.system)
          .map(function (note: Note) {
            const body = note.body.replace(
              "/uploads/",
              "https://git.niice.nl/niicedigitalmarketing/" + projectName + "/uploads/"
            );
            return {
              id: note.id,
              body: body,
              userId: note.author.id,
              createdAt: new Date(note.created_at),
            };
          })
      )
      .catch(error => {
        throw new Error(`Failed to get issues: ${error.message}`);
      });
  }

  return issues;
};

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const mapStatusFromLabels = (labels: string[]) => {
  let newStatus = "backlog";

  // Our labels from gitlab.
  const statuses = {};
  // labels are in order.
  // refinement comes before todo, because if there is anything wrong, we dont' want the issue on status todo.
  statuses["Status::On hold"] = "Todo"; //TODO: what to do with On Hold? Extra label?
  statuses["Status::Review"] = "Review";
  statuses["Status::Estimate"] = "Estimate";
  statuses["Status::Refinement"] = "Todo"; // label: Needs attention
  statuses["Status::Ready for Release"] = "Done"; // label ready for release?
  statuses["Status::Approved Internally"] = "Review";
  statuses["Status::In progress"] = "In Progress";
  statuses["Status::To-do"] = "Todo";

  labels.forEach(label => {
    if (label in statuses) {
      newStatus = statuses[label];
      return;
    }
  });

  return newStatus;
};

// export const mapLabels = (string:string[]) => {
//   const labels = {}
// }
