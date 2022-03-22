const _ = require('lodash')
const Jira = require('./common/net/Jira')
const GitHub = require('./common/net/GitHub')

module.exports = class {
    constructor ({ githubEvent, argv, config, githubToken }) {
        this.Jira = new Jira({
            baseUrl: config.baseUrl,
            token: config.token,
            email: config.email,
        })

        this.GitHub = new GitHub({
            token: githubToken,
        })

        this.config = config
        this.argv = argv
        this.githubEvent = githubEvent
        this.githubToken = githubToken
    }

    async execute () {
        const { argv, githubEvent, config } = this
        const projectKey = argv.project
        const issuetypeName = argv.issuetype
        let tasks = []

        if (githubEvent.pull_request.title.indexOf('automerge_release') !== -1) {
            console.log('Automerge is excluded from this action')

            return
        }

        const jiraIssue = config.issue ? await this.Jira.getIssue(config.issue) : null


        if (Number(githubEvent.pull_request.commits) > 0) {
            tasks = await this.findEslintInPr(githubEvent.repository, githubEvent.pull_request.number)
        }

        if (tasks.length === 0) {
            console.log('no eslint-disables found :)')

            return
        }

        // map custom fields
        const { projects } = await this.Jira.getCreateMeta({
            expand: 'projects.issuetypes.fields',
            projectKeys: projectKey,
            issuetypeNames: issuetypeName,
        })

        if (projects.length === 0) {
            console.error(`project '${projectKey}' not found`)

            return
        }

        const [project] = projects

        if (project.issuetypes.length === 0) {
            console.error(`issuetype '${issuetypeName}' not found`)

            return
        }

        const issues = tasks.map(async ({ content, route }) => {
            let providedFields = [{
                key: 'project',
                value: {
                    key: projectKey,
                },
            }, {
                key: 'issuetype',
                value: {
                    name: issuetypeName,
                },
            }, {
                key: 'summary',
                value: `Refactor in order to remove eslint disable: ${content}`,
            },
                {
                    key: 'assignee',
                    value: { accountId: jiraIssue && jiraIssue.fields.assignee.accountId },
                }, {
                    key: 'labels',
                    value: ['ESlint'],
                }, {
                    key: 'description',
                    value: `Can be found in the following file: ${route.slice(5)}
        
        
        
        Action was triggered by this PR: ${githubEvent.pull_request.html_url}
        `,
                },
            ]

            if (argv.fields) {
                providedFields = [...providedFields, ...this.transformFields(argv.fields)]
            }

            const payload = providedFields.reduce((acc, field) => {
                acc.fields[field.key] = field.value

                return acc
            }, {
                fields: {},
            })

            console.log('Constructed fields: ', payload)

            return (await this.Jira.createIssue(payload)).key
        })

        return { issues: await Promise.all(issues) }
    }

    transformFields (fields) {
        return Object.keys(fields).map((fieldKey) => ({
            key: fieldKey,
            value: fields[fieldKey],
        }))
    }

    async findEslintInPr (repo, prId) {
        const prDiff = await this.GitHub.getPRDiff(repo.full_name, prId)
        const rx = /^\+.*(?:\/\/|\/\*)\s+eslint-disable(.*)$/gm
        const routeRegex = /^\+\+\+.b\/.*$/gm

        const matches = prDiff.match(rx)
        console.log('Matches:', matches);

        if (!matches || !matches.length) return []

        return matches
            .map(_.trim)
            .filter(Boolean)
            .map((match) => {
                console.log('Match', match);
                const end = prDiff.indexOf(match)

                const routeMatches = prDiff.slice(0, end).match(routeRegex)
                const lastRouteMatch = routeMatches[routeMatches.length - 1]

                return { content: match.slice(match.indexOf('eslint-disable')), route: lastRouteMatch }
            }).filter((el) => (el.route.includes('/modules/') || el.route.includes('/server/')) && !el.route.includes('.test.') && !el.route.includes('__specs__') && !el.route.includes('__analytics__') && !el.route.includes('__new_specs__'))
    }
}