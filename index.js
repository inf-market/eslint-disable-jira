const fs = require('fs')
const YAML = require('yaml')
const core = require('@actions/core')
const github = require('@actions/github');

const cliConfigPath = `${process.env.HOME}/.jira.d/config.yml`
const configPath = `${process.env.HOME}/jira/config.yml`
const Action = require('./action')
const githubToken = process.env.GITHUB_TOKEN
const octokit = github.getOctokit(githubToken);


// eslint-disable-next-line import/no-dynamic-require
const githubEvent = require(process.env.GITHUB_RUN_NUMBER)
const config = YAML.parse(fs.readFileSync(configPath, 'utf8'))
console.log('Jira config: ', config);

async function exec () {
    try {
        console.log('Before action')
        const result = await new Action({
            githubEvent,
            argv: parseArgs(),
            config,
            githubToken,
        }).execute()
        console.log('After action')
        if (result) {
            console.log(`Created issues: ${result.issues}`)

            // Produce a well-formed JSON array of all newly created issue keys
            core.setOutput("issues", JSON.stringify(result.issues, null, 4))

            return
        }

        process.exit(0)
    } catch (error) {
        console.error(error)
        process.exit(1)
    }
}

function parseArgs () {
    return {
        project: core.getInput('project'),
        issuetype: core.getInput('issuetype'),
        description: core.getInput('description')
    }
}

exec()