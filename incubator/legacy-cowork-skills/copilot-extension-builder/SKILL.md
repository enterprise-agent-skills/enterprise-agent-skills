---
name: Copilot Extension Builder
description: Build powerful Microsoft Copilot extensions that surface SAP data, run business logic, and integrate Teams workflows. Master declarative agents, API plugins, Graph connectors, Adaptive Cards, and Teams message extensions. Deploy to production and measure user impact. Your guide to extending Copilot for enterprise needs.
---

# Copilot Extension Builder

This skill guides you through building, testing, and deploying Microsoft Copilot extensions—from simple API plugins to complex declarative agents that bring SAP data and enterprise logic into Copilot conversations.

## What This Skill Does

- **Declarative Agents**: Build AI agents in Copilot Studio with custom actions, knowledge bases, and orchestration logic
- **API Plugins**: Connect Copilot to REST APIs (SAP OData, custom backends, third-party services)
- **Graph Connectors**: Index SAP documents, transports, or incident data into Microsoft Graph for enterprise search in Copilot
- **Teams Message Extensions**: Add custom message actions (e.g., "Create SAP transport from message")
- **Adaptive Cards**: Design rich, interactive card UIs for displaying SAP data in Teams/Copilot
- **Microsoft Graph API**: Query organizational data (users, calendar, files) from within your extension
- **Authentication**: Implement OAuth 2.0 with Azure AD, manage tokens, handle SSO for SAP systems
- **Copilot Studio Actions**: Create no-code actions that call APIs, process data, or integrate with backend systems
- **Bot Framework**: Build stateful conversational agents with LUIS intent recognition and advanced logic
- **Publishing & Distribution**: Deploy to Teams, M365 app catalog, and manage extension governance
- **Testing & Debugging**: Test locally, debug in Teams, analyze telemetry, handle edge cases
- **SAP Data Integration**: Fetch SAP data via OData, RFC, or REST; surface in Copilot with graph connectors or API plugins

## How to Use This Skill

### Scenario: Build a simple API plugin for SAP data

1. **Plan your plugin**: "I want to create a Copilot plugin that lets users query SAP transports by project code. Users say 'show me transports for project ABC' and get a formatted list. What's the architecture?"

2. **Build the API**: "Write a Python REST API that queries our SAP system and returns transports. Include error handling and rate limiting."

3. **Create the plugin manifest**: "Generate a plugin manifest that tells Copilot how to call my API. Include the function signature, parameters, and response format."

4. **Test locally**: "How do I test this in Copilot Desktop before deploying to Teams?"

### Scenario: Build a declarative agent in Copilot Studio

1. **Define the agent**: "I want a Copilot agent that helps users troubleshoot SAP batch job failures. The agent should: (1) fetch job logs from SM37, (2) analyze error codes, (3) suggest fixes. How do I build this?"

2. **Add actions**: "Create Copilot Studio actions for: FetchJobLogs, ParseErrorCode, SuggestFix. Each calls our SAP backend API."

3. **Add knowledge**: "Load our SAP troubleshooting guide into the agent's knowledge base. The agent should cite sources when giving advice."

4. **Test and deploy**: "Walk me through testing the agent and deploying to production."

### Scenario: Teams message extension for SAP workflows

1. **Plan the extension**: "I want a message extension that lets users create SAP transports from Teams messages. User right-clicks a message, clicks 'Create SAP Transport,' and a form appears."

2. **Build the action**: "Create a Teams action handler that captures message context and opens a transport creation form."

3. **Integrate with SAP**: "The form submits to our backend API, which creates the transport. Show me the integration."

4. **Package and deploy**: "How do I test this in Teams and publish to our M365 app catalog?"

## Key Concepts

### Declarative Agents (Copilot Studio)
**What they are**: AI-powered agents you configure in Copilot Studio (low-code/no-code UI).

**Key components:**
1. **Instructions**: Tell the agent what it does and how to behave
2. **Actions**: Functions the agent can call (API calls, knowledge lookup, logic)
3. **Knowledge**: Documents/FAQs the agent can reference and cite
4. **Conversation starters**: Suggested prompts to guide users

**Example use case**: SAP troubleshooting agent
```
Instructions:
"You are an expert SAP system troubleshooter. When users report batch job failures, 
system errors, or performance issues:
1. Ask clarifying questions (system, time, impact)
2. Fetch relevant logs from SAP
3. Analyze error codes
4. Suggest root causes and fixes
5. Cite your sources (troubleshooting guide, SAP notes)
If you don't know the answer, escalate to [SAP_SUPPORT_TEAM]"

Actions:
- FetchJobLogs(job_name, date_range) → returns SM37 job logs
- QueryErrorCode(error_code) → queries SAP note database
- FetchSystemLogs(system, time_range) → returns SM21 logs
- CreateIncident(description, priority) → creates support ticket

Knowledge Base:
- Upload: SAP troubleshooting guide, common error codes, FAQ
- Agent cites sources when answering
```

### API Plugins (OpenAPI/OpenAI standard)
**What they are**: REST APIs that Copilot can discover and call via OpenAPI specification.

**Key requirements:**
1. **REST API**: Accessible endpoint (Azure API Management, custom backend, etc.)
2. **OpenAPI 3.0 spec**: Describes API operations, parameters, responses
3. **Authentication**: OAuth 2.0 or API key (Copilot handles token refresh)
4. **Rate limiting**: Prevent abuse; include retry logic

**Example plugin manifest (SAP transport query)**:
```yaml
openapi: 3.0.0
info:
  title: SAP Transport API
  version: 1.0.0
  description: Query and manage SAP transports
servers:
  - url: https://api.company.com/sap
paths:
  /transports:
    get:
      summary: List transports by project
      parameters:
        - name: project_code
          in: query
          required: true
          schema:
            type: string
        - name: status
          in: query
          schema:
            type: string
            enum: [OPEN, RELEASED, IMPORTED]
      responses:
        '200':
          description: List of transports
          content:
            application/json:
              schema:
                type: array
                items:
                  type: object
                  properties:
                    transport_id:
                      type: string
                    description:
                      type: string
                    status:
                      type: string
                    created_date:
                      type: string
  /transports/{transport_id}/details:
    get:
      summary: Get detailed info about a transport
      parameters:
        - name: transport_id
          in: path
          required: true
          schema:
            type: string
      responses:
        '200':
          description: Transport details
          content:
            application/json:
              schema:
                type: object
                properties:
                  transport_id:
                    type: string
                  description:
                    type: string
                  objects:
                    type: array
                    items:
                      type: object
                  status:
                    type: string
                  owner:
                    type: string
```

**How Copilot uses it:**
```
User: "Show me all open transports for project ABC"
↓
Copilot parses intent → calls /transports?project_code=ABC&status=OPEN
↓
Your API returns list of transports
↓
Copilot formats response in conversation
```

### Graph Connectors (Microsoft Graph Search)
**What they are**: Indexing pipelines that pull data into Microsoft Graph, enabling enterprise search in Copilot.

**Use case**: Index SAP incidents, transports, or change requests so users can search them in Copilot
```
SAP system → Your indexer (fetches data every hour)
↓
Microsoft Graph connector (pushes to Graph search)
↓
User searches Copilot: "Find all critical incidents last week"
↓
Copilot searches Graph index → returns SAP incidents matching query
```

**Benefits:**
- Data indexed and searchable (vs. API plugins which are call-based)
- Faster for large datasets
- Natural language search across documents
- Content can be cited with source

**Implementation steps:**
1. Build indexer service (fetches data from SAP)
2. Create Graph connector (maps SAP schema to Microsoft schema)
3. Configure ingestion schedule (hourly, daily, etc.)
4. Test search in Microsoft Search (Bing, Teams, Outlook)
5. Enable in Copilot for business chat

### Adaptive Cards
**What they are**: JSON-based UI framework for rich interactive messages in Teams/Copilot.

**Common uses:**
- Display formatted SAP data (transports, job logs, incidents)
- Input forms (search filters, transport creation, approval workflows)
- Interactive actions (buttons, dropdowns, toggles)

**Example: SAP transport details card**
```json
{
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "type": "AdaptiveCard",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "Transport DEVK900123",
      "weight": "bolder",
      "size": "large"
    },
    {
      "type": "TextBlock",
      "text": "ABAP Code – Quality Fixes",
      "isSubtle": true
    },
    {
      "type": "FactSet",
      "facts": [
        {
          "name": "Owner:",
          "value": "John Smith"
        },
        {
          "name": "Status:",
          "value": "Released"
        },
        {
          "name": "Created:",
          "value": "2026-04-10"
        },
        {
          "name": "Description:",
          "value": "Critical bug fixes for SD module"
        }
      ]
    },
    {
      "type": "TextBlock",
      "text": "Objects Included",
      "weight": "bolder",
      "separator": true,
      "spacing": "medium"
    },
    {
      "type": "Container",
      "items": [
        {
          "type": "TextBlock",
          "text": "• ZFICO_POSTING (ABAP report)"
        },
        {
          "type": "TextBlock",
          "text": "• ZFICO_VAL (ABAP function module)"
        }
      ]
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "View in SE09",
      "url": "https://sap-system.company.com/se09?transport=DEVK900123"
    },
    {
      "type": "Action.Submit",
      "title": "Create Import Request",
      "data": {
        "action": "import_request",
        "transport_id": "DEVK900123"
      }
    }
  ]
}
```

### Message Extensions (Teams)
**What they are**: Custom actions available via right-click on messages in Teams.

**Example: "Create SAP Transport from Message"**
```
1. User has a Teams message: "Ready to deploy the quality fixes"
2. User right-clicks → sees "Create SAP Transport" option
3. Clicks it → form pre-fills with message context
4. Submits → SAP transport is created; status posted back to Teams
```

**How to build:**
1. Define action handler in Teams app manifest
2. Listen for action invocation in your bot service
3. Return a task module (form) or adaptive card
4. Handle form submission → call SAP API → respond to Teams

### Authentication & SSO
**OAuth 2.0 flow:**
```
User opens Copilot extension
↓ Extension needs SAP data; user not authenticated
↓ Extension initiates OAuth → user redirected to Azure AD login
↓ User grants permission (scope: read SAP data)
↓ Azure AD returns access token
↓ Extension uses token to call SAP API (via API management)
↓ SAP API validates token; returns data
↓ Extension displays data in Copilot
```

**For Copilot:**
- Use "MSAL" (Microsoft Authentication Library) for token management
- Store tokens securely (use Azure Key Vault, not local storage)
- Refresh tokens automatically before expiry
- Handle token errors gracefully

**For SAP:**
- SAP OData services can use Azure AD as OAuth provider
- Or: Use SAP BTP Identity Provider (integrates with Azure AD)
- Or: Call custom backend that manages SAP RFC auth

### Copilot Studio Actions (no-code)
**Simple example:** Fetch SAP batch job logs

```
Action: FetchJobLogs
Inputs:
  - job_name (text)
  - date_range (dropdown: Last 24h, Last 7d, Custom)

Steps:
1. Call API: GET /api/sap/jobs/{job_name}/logs?days=1
2. Parse response (JSON)
3. Format for display (list of log entries)
4. Return formatted logs

Output:
  - logs (array of objects: timestamp, message, status)
```

**More complex example:** Analyze batch job failure → suggest fix

```
Action: AnalyzeJobFailure
Inputs:
  - job_name (text)
  - error_code (text)

Steps:
1. Fetch job logs (call FetchJobLogs)
2. Parse error code
3. Query knowledge base: Does this error code exist?
4. If yes: return suggested fixes + SAP notes
5. If no: return "Unknown error; recommend manual review"
6. Create incident ticket for investigation

Output:
  - status (success/failure)
  - root_cause (text)
  - suggested_fixes (array)
  - sap_notes (array with links)
  - incident_ticket (link if created)
```

### Bot Framework (Advanced)
**When to use:** Complex multi-turn conversations, state management, integration with multiple systems.

**Example: SAP incident triage bot**
```
Bot logic:
1. User: "My batch job failed"
   → Bot asks: "What's the job name?"
   
2. User: "ZJOB_NIGHTLY"
   → Bot stores state; asks: "When did it fail?"
   
3. User: "2 hours ago"
   → Bot fetches logs; analyzes; suggests fixes
   → If still unresolved, offers: "Create incident ticket?"
   
4. User: "Yes"
   → Bot creates ticket; sends confirmation with ticket number

Code example (Node.js with Bot Framework):
const { ActivityHandler } = require('botbuilder');

class IncidentTriageBot extends ActivityHandler {
  async onMessage(context) {
    const userMessage = context.activity.text;
    
    if (userMessage.includes('batch job failed')) {
      await context.sendActivity('What is the job name?');
      context.conversationState.jobName = null;
    } else if (context.conversationState.jobName) {
      // Continue conversation
      context.conversationState.jobName = userMessage;
      const logs = await fetchJobLogs(userMessage);
      const suggestion = analyzeLogs(logs);
      await context.sendActivity(`Looks like: ${suggestion}`);
    }
  }
}
```

### Teams Toolkit Setup
**What is it**: VS Code extension that scaffolds Teams apps, handles authentication, local debugging, and deployment.

**Steps:**
1. Install Teams Toolkit for VS Code
2. Create new Teams app (choose template: Bot, Tab, Message Extension, etc.)
3. Configure manifest.json (app name, permissions, scopes)
4. Code your extension (bot service, message handlers, API calls)
5. Test locally (F5 debugging in Teams)
6. Deploy to Azure (App Service, Bot Service)
7. Publish to Teams App Catalog

## Practical Examples

### Example 1: Simple API Plugin (SAP Transport Query)

**Python Flask API:**
```python
from flask import Flask, request, jsonify
import requests
from functools import wraps
from flask_limiter import Limiter

app = Flask(__name__)
limiter = Limiter(app, key_func=lambda: request.remote_addr)

# SAP API credentials (from Azure Key Vault)
SAP_BASE_URL = "https://sap-api.company.com"
SAP_USER = os.environ['SAP_USER']
SAP_PASSWORD = os.environ['SAP_PASSWORD']

@app.route('/api/transports', methods=['GET'])
@limiter.limit("100 per hour")
def get_transports():
    """Fetch SAP transports by project code"""
    project_code = request.args.get('project_code')
    status = request.args.get('status', 'OPEN')
    
    if not project_code:
        return jsonify({"error": "project_code required"}), 400
    
    try:
        # Call SAP OData service
        url = f"{SAP_BASE_URL}/odata/v2/Transports"
        params = {
            "$filter": f"PROJECT eq '{project_code}' and STATUS eq '{status}'",
            "$select": "TRANSPORT_ID,DESCRIPTION,STATUS,CREATED_DATE"
        }
        response = requests.get(url, params=params, auth=(SAP_USER, SAP_PASSWORD))
        response.raise_for_status()
        
        transports = response.json()['d']['results']
        return jsonify({
            "count": len(transports),
            "transports": transports
        })
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/transports/<transport_id>/details', methods=['GET'])
@limiter.limit("100 per hour")
def get_transport_details(transport_id):
    """Fetch detailed transport info"""
    try:
        url = f"{SAP_BASE_URL}/odata/v2/Transports('{transport_id}')"
        response = requests.get(url, auth=(SAP_USER, SAP_PASSWORD))
        response.raise_for_status()
        
        transport = response.json()['d']
        return jsonify(transport)
    except requests.exceptions.RequestException as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=False, port=5000)
```

**OpenAPI spec** (saved as openapi.yaml):
```yaml
openapi: 3.0.0
info:
  title: SAP Transport API
  version: 1.0.0
servers:
  - url: https://api.company.com/sap
paths:
  /api/transports:
    get:
      operationId: GetTransports
      summary: List transports by project
      parameters:
        - name: project_code
          in: query
          required: true
          schema:
            type: string
            description: Project code (e.g., ABC, XYZ)
        - name: status
          in: query
          schema:
            type: string
            enum: [OPEN, RELEASED, IMPORTED]
      responses:
        '200':
          description: Transport list
          content:
            application/json:
              schema:
                type: object
                properties:
                  count:
                    type: integer
                  transports:
                    type: array
                    items:
                      type: object
                      properties:
                        transport_id:
                          type: string
                        description:
                          type: string
                        status:
                          type: string
                        created_date:
                          type: string
```

**How Copilot calls it:**
```
User: "Show me released transports for project ABC"
↓
Copilot plugin (using OpenAPI spec) → 
  GET https://api.company.com/sap/api/transports?project_code=ABC&status=RELEASED
↓
Your API returns transports
↓
Copilot displays them in conversation
```

### Example 2: Declarative Agent (SAP System Health)

**Copilot Studio configuration:**

```
Agent Name: SAP System Health Assistant
Description: Monitor SAP system health and help diagnose issues

Instructions:
You are an expert SAP system monitor. Help users understand SAP system status:
- Check batch jobs (SM37)
- Monitor database space (DB02)
- Track RFC connections (SM59)
- Provide recommendations for performance improvement

When a user asks about system health:
1. Fetch current metrics from monitoring API
2. Analyze against baselines
3. Flag any warnings/alerts
4. Suggest actions if issues found
5. Cite your data sources

Be proactive: If a metric is approaching threshold, warn the user.

Actions:
- CheckBatchJobs(system, time_period)
- CheckDatabaseSpace(system)
- CheckRFCConnections(system)
- GetPerformanceMetrics(system)
- CreateIncident(description, severity)

Knowledge Base:
- Upload: SAP performance tuning guide
- Upload: Common batch job failure causes
- Upload: Database administration best practices
```

**How users interact:**
```
User: "Is our QA system healthy?"
↓
Agent calls: CheckBatchJobs(QA, last_24h)
Agent calls: CheckDatabaseSpace(QA)
Agent calls: CheckRFCConnections(QA)
↓
Agent analyzes results and reports:
"QA system is healthy. 
- 47 batch jobs completed, 0 failures
- Database at 76% capacity (healthy)
- All RFC connections OK
- Avg response time: 890ms (good)

One note: Job ZJOB_CUSTOM_SYNC took 18min (usually 10min). 
Worth monitoring—might indicate increasing data volume."
```

### Example 3: Teams Message Extension (SAP Incident Creation)

**Manifest.json:**
```json
{
  "manifestVersion": "1.16",
  "version": "1.0.0",
  "id": "12345678-1234-1234-1234-123456789012",
  "name": {
    "short": "SAP Incident Creator",
    "full": "Create SAP incidents from Teams messages"
  },
  "description": {
    "short": "Right-click a message to create an SAP support incident",
    "full": "Convert Teams messages into SAP incident tickets"
  },
  "developer": {
    "name": "Your Company",
    "websiteUrl": "https://company.com",
    "privacyUrl": "https://company.com/privacy",
    "termsOfUseUrl": "https://company.com/terms"
  },
  "bots": [
    {
      "botId": "bot-service-app-id",
      "scopes": ["team", "personal"],
      "commandLists": [
        {
          "scopes": ["team", "personal"],
          "commands": [
            {
              "title": "Help",
              "description": "Get help using SAP Incident Creator"
            }
          ]
        }
      ]
    }
  ],
  "composeExtensions": [
    {
      "botId": "bot-service-app-id",
      "canUpdateConfiguration": false,
      "commands": [
        {
          "id": "createIncident",
          "type": "action",
          "title": "Create SAP Incident",
          "description": "Create an incident from this message",
          "parameters": [
            {
              "name": "title",
              "title": "Incident Title",
              "description": "Brief description of the issue",
              "inputType": "text"
            },
            {
              "name": "severity",
              "title": "Severity",
              "description": "Incident severity level",
              "inputType": "choiceset",
              "choices": [
                { "title": "Critical", "value": "CRITICAL" },
                { "title": "High", "value": "HIGH" },
                { "title": "Medium", "value": "MEDIUM" },
                { "title": "Low", "value": "LOW" }
              ]
            },
            {
              "name": "description",
              "title": "Description",
              "description": "Detailed description",
              "inputType": "textarea"
            }
          ]
        }
      ]
    }
  ],
  "permissions": [
    "identity",
    "messageTeamMembers"
  ],
  "validDomains": [
    "company.com",
    "api.company.com"
  ]
}
```

**Bot service (Node.js):**
```javascript
const { TeamsActivityHandler, CardFactory, MessageFactory } = require('botbuilder');
const axios = require('axios');

class IncidentCreatorBot extends TeamsActivityHandler {
  async handleTeamsMessagingExtensionSubmitAction(context, action) {
    // Called when user submits the form
    const { title, severity, description } = action.data;
    const messageContext = action.context.activity;
    
    try {
      // Create SAP incident
      const incidentResponse = await axios.post(
        'https://sap-api.company.com/incidents',
        {
          title: title,
          severity: severity,
          description: description,
          source: 'Teams',
          source_message_url: messageContext.webUrl,
          created_by: context.activity.from.name
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.SAP_API_TOKEN}`
          }
        }
      );
      
      const incidentId = incidentResponse.data.id;
      
      // Return confirmation card
      return {
        composeExtension: {
          type: 'result',
          attachmentLayout: 'grid',
          attachments: [
            CardFactory.adaptiveCard({
              "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
              "type": "AdaptiveCard",
              "version": "1.4",
              "body": [
                {
                  "type": "TextBlock",
                  "text": "✓ Incident Created",
                  "weight": "bolder",
                  "color": "good",
                  "size": "large"
                },
                {
                  "type": "FactSet",
                  "facts": [
                    { "name": "ID:", "value": incidentId },
                    { "name": "Severity:", "value": severity },
                    { "name": "Title:", "value": title }
                  ]
                },
                {
                  "type": "TextBlock",
                  "text": "The incident has been created and assigned to the SAP support team.",
                  "wrap": true
                }
              ],
              "actions": [
                {
                  "type": "Action.OpenUrl",
                  "title": "View Incident",
                  "url": `https://sap-system.company.com/incidents/${incidentId}`
                }
              ]
            })
          ]
        }
      };
    } catch (error) {
      return {
        composeExtension: {
          type: 'result',
          attachmentLayout: 'list',
          attachments: [
            CardFactory.adaptiveCard({
              "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
              "type": "AdaptiveCard",
              "version": "1.4",
              "body": [
                {
                  "type": "TextBlock",
                  "text": "Error Creating Incident",
                  "color": "attention",
                  "weight": "bolder"
                },
                {
                  "type": "TextBlock",
                  "text": error.message,
                  "wrap": true
                }
              ]
            })
          ]
        }
      };
    }
  }
}
```

## Integration Points

- **Copilot for Microsoft 365**: Declarative agents, API plugins, graph connectors
- **Microsoft Graph API**: User data, calendar, files, organizational structure
- **Azure AD**: OAuth 2.0 authentication, SSO
- **Teams**: Message extensions, bots, Adaptive Cards
- **SAP Systems**: OData services, RFC calls (via backend), batch jobs (SM37), transports (SE09)
- **Azure services**: API Management (for SAP API gateway), Key Vault (secrets), App Service (hosting)
- **Copilot Studio**: No-code action builder, knowledge upload, agent configuration
- **Teams Toolkit**: Local development, debugging, deployment

## Common Pitfalls & Solutions

| Problem | Solution |
|---------|----------|
| API calls are slow; Copilot times out | Cache results; use async operations; add pagination; index data in Graph connector instead |
| Token refresh fails during long conversation | Implement automatic token refresh before expiry; use refresh token grant flow |
| Copilot misunderstands user intent | Add clearer action descriptions/examples in OpenAPI spec or agent instructions |
| SAP data isn't searchable in Copilot | Use Graph connector for indexing instead of API plugin; enables full-text search |
| Message extension form looks broken in mobile Teams | Test Adaptive Card in mobile; ensure single-column layout; minimize required fields |
| Declarative agent is too slow (multi-step actions) | Parallelize API calls; use async/await; avoid sequential loops |
| Authentication fails; user sees login prompt repeatedly | Check token expiry; test with long-running processes; ensure refresh token works |

## Deployment Checklist

- [ ] **Authentication**: Test OAuth flow; token refresh; error handling
- [ ] **Performance**: Monitor API response times; set timeouts; cache where possible
- [ ] **Data privacy**: Don't expose sensitive SAP data; implement row-level security if applicable
- [ ] **Error handling**: Graceful failures; user-friendly error messages; logging
- [ ] **Rate limiting**: Implement quota to prevent abuse; tell users when they hit limits
- [ ] **Documentation**: Update agent instructions; document API parameters; publish to wiki
- [ ] **Testing**: Unit test bot logic; test in Teams locally; test in production environment
- [ ] **Monitoring**: Log Copilot interactions; track API call success rates; alert on failures
- [ ] **Governance**: Get security approval; request data classifications; establish usage policies
- [ ] **Support**: Plan for user support; document troubleshooting steps; assign owner

## Workflow: From Idea to Deployed Extension

1. **Define the use case**: What will users ask? What data do they need?
2. **Choose architecture**: API plugin (real-time, flexible) vs. Graph connector (searchable, indexed) vs. declarative agent (conversational, intelligent)
3. **Build the backend**: API, Graph connector, or actions that fetch/process data
4. **Implement authentication**: OAuth, SSO, or service account
5. **Create plugin/agent**: OpenAPI spec, Copilot Studio configuration, or Teams manifest
6. **Test locally**: Use Teams Toolkit or Copilot emulator
7. **Test with users**: Get feedback; iterate on UX/messaging
8. **Deploy to staging**: Validate in staging environment
9. **Deploy to production**: Monitor usage; gather telemetry
10. **Support & iterate**: Fix bugs; add features based on user feedback

---

**Keywords**: Copilot extension, declarative agent, API plugin, Graph connector, Teams message extension, Adaptive Cards, Bot Framework, Copilot Studio, OAuth, Azure AD, Teams Toolkit, Microsoft Graph, SAP OData, semantic search, OpenAPI, AI agents, enterprise automation.
