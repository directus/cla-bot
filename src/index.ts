import { getInput, setOutput } from "@actions/core";
import { context, getOctokit } from "@actions/github";
import type { components } from "@octokit/openapi-types";
import yaml from "js-yaml";

const githubToken = getInput("github-token");
const contributorsFile = getInput("contributors-file");

if (!context.payload.pull_request) {
	throw new Error("No pull request context available");
}

const octokit = getOctokit(githubToken);

const commits = await octokit.rest.pulls.listCommits({
	owner: context.repo.owner,
	repo: context.repo.repo,
	pull_number: context.payload.pull_request.number,
});

const missingAuthors = commits.data.filter((commit) => !commit.author?.login);

if (missingAuthors.length > 0) {
	throw new Error(`PR contains commits without associated GitHub users`);
}

const authors = Array.from(
	new Set(
		commits.data
			.filter((commit) => commit.author!.type.toLowerCase() !== "bot")
			.map((commit) => commit.author!.login)
	)
).sort();

const fileContentResponse = await octokit.rest.repos.getContent({
	owner: context.payload.pull_request["head"]["repo"]["owner"]["login"],
	repo: context.payload.pull_request["head"]["repo"]["name"],
	path: contributorsFile,
	ref: context.payload.pull_request["head"]["ref"],
});

const contributors = (yaml.load(
	Buffer.from(
		(fileContentResponse.data as components["schemas"]["content-file"]).content,
		"base64"
	).toString()
) ?? []) as string[];

const missing = authors.filter(
	(author) => contributors.includes(author) === false
);

if (missing.length > 0) {
	console.log(
		`Not all contributors have signed the CLA. Missing: ${missing.join(", ")}`
	);

	setOutput("missing", missing.map((login) => `@${login}`).join(", "));

	process.exit(1);
}
