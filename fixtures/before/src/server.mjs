// Conformance fixture: the "before" side of the migration delta.
//
// MCP revision 2025-11-25, written on @modelcontextprotocol/sdk 1.30.0 with
// express 5 and zod 4, the way a good 2025-era Streamable HTTP server was
// written: a stateful transport with a generated Mcp-Session-Id, a GET stream
// for server-initiated traffic, DELETE to end the session, and server-to-client
// requests (elicitation, sampling, roots) issued from inside tool handlers.
//
// It exposes the same functional surface as fixtures/after, plus the pieces the
// 2026-07-28 revision deletes: ping, logging/setLevel, resources/subscribe and
// resources/unsubscribe. Those are exactly what the migration has to remove.
//
// Run: PORT=3001 node fixtures/before/src/server.mjs
// Endpoint: POST/GET/DELETE http://localhost:3001/mcp

import express from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { completable } from '@modelcontextprotocol/sdk/server/completable.js';
import {
    InitializeRequestSchema,
    McpError,
    PingRequestSchema,
    SetLevelRequestSchema,
    SubscribeRequestSchema,
    UnsubscribeRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const PORT = Number(process.env.PORT ?? 3001);
const MCP_PATH = '/mcp';

const PNG_1X1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WAV_SILENT = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';

const WATCHED_RESOURCE_URI = 'test://watched-resource';
const KNOWN_RESOURCE_URIS = new Set(['test://static-text', 'test://static-binary', WATCHED_RESOURCE_URI]);

// Log levels, least to most severe, as the 2025-11-25 logging utility orders them.
const LOG_LEVELS = ['debug', 'info', 'notice', 'warning', 'error', 'critical', 'alert', 'emergency'];

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function text(value) {
    return { content: [{ type: 'text', text: value }] };
}

function createServer() {
    // Per-session state this revision makes the server responsible for: the log
    // level set through logging/setLevel and the set of subscribed resources.
    let logLevel = 'debug';
    const subscriptions = new Set();

    const server = new McpServer(
        { name: 'mcp-migrate-delta-before', version: '1.0.0' },
        {
            capabilities: {
                tools: { listChanged: true },
                resources: { subscribe: true, listChanged: true },
                prompts: { listChanged: true },
                logging: {},
                completions: {}
            }
        }
    );

    const shouldLog = level => LOG_LEVELS.indexOf(level) >= LOG_LEVELS.indexOf(logLevel);

    // ------------------------------------------ methods deleted in 2026-07-28

    // logging/setLevel. The client picks a severity floor and the server filters
    // its notifications/message traffic against it for the rest of the session.
    server.server.setRequestHandler(SetLevelRequestSchema, async request => {
        logLevel = request.params.level;
        return {};
    });

    // ping. Either side may send it to check the connection is still alive.
    server.server.setRequestHandler(PingRequestSchema, async () => ({}));

    // resources/subscribe and resources/unsubscribe. Subscribing to a URI the
    // server does not serve is a resource-not-found error; this revision spells
    // it -32002.
    server.server.setRequestHandler(SubscribeRequestSchema, async request => {
        const { uri } = request.params;
        if (!KNOWN_RESOURCE_URIS.has(uri)) {
            throw new McpError(-32002, `Resource not found: ${uri}`, { uri });
        }
        subscriptions.add(uri);
        return {};
    });

    server.server.setRequestHandler(UnsubscribeRequestSchema, async request => {
        const { uri } = request.params;
        if (!KNOWN_RESOURCE_URIS.has(uri)) {
            throw new McpError(-32002, `Resource not found: ${uri}`, { uri });
        }
        subscriptions.delete(uri);
        return {};
    });

    server.server.oninitialized = () => {
        console.error(`[before] session initialized: ${server.server.transport?.sessionId ?? 'none'}`);
    };

    // ---------------------------------------------------------------- tools

    server.registerTool(
        'test_simple_text',
        { description: 'Returns a single text content block.', inputSchema: {} },
        async () => text('This is a simple text response for testing.')
    );

    server.registerTool(
        'test_image_content',
        { description: 'Returns a single image content block.', inputSchema: {} },
        async () => ({ content: [{ type: 'image', data: PNG_1X1, mimeType: 'image/png' }] })
    );

    server.registerTool(
        'test_audio_content',
        { description: 'Returns a single audio content block.', inputSchema: {} },
        async () => ({ content: [{ type: 'audio', data: WAV_SILENT, mimeType: 'audio/wav' }] })
    );

    server.registerTool(
        'test_embedded_resource',
        { description: 'Returns an embedded resource content block.', inputSchema: {} },
        async () => ({
            content: [
                {
                    type: 'resource',
                    resource: {
                        uri: 'test://embedded-resource',
                        mimeType: 'text/plain',
                        text: 'This is an embedded resource content.'
                    }
                }
            ]
        })
    );

    server.registerTool(
        'test_multiple_content_types',
        { description: 'Returns text, image and embedded resource blocks in one result.', inputSchema: {} },
        async () => ({
            content: [
                { type: 'text', text: 'Multiple content types test:' },
                { type: 'image', data: PNG_1X1, mimeType: 'image/png' },
                {
                    type: 'resource',
                    resource: {
                        uri: 'test://mixed-content-resource',
                        mimeType: 'application/json',
                        text: JSON.stringify({ mixed: true })
                    }
                }
            ]
        })
    );

    server.registerTool(
        'test_tool_with_progress',
        { description: 'Emits three progress notifications before returning.', inputSchema: {} },
        async (_args, extra) => {
            const progressToken = extra._meta?.progressToken;
            if (progressToken !== undefined) {
                for (const progress of [0, 50, 100]) {
                    await extra.sendNotification({
                        method: 'notifications/progress',
                        params: { progressToken, progress, total: 100 }
                    });
                    await sleep(50);
                }
            }
            return text(`Progress complete: ${String(progressToken)}`);
        }
    );

    server.registerTool(
        'test_tool_with_logging',
        { description: 'Sends three log messages while it runs.', inputSchema: {} },
        async (_args, extra) => {
            for (const message of ['Tool execution started', 'Tool processing data', 'Tool execution completed']) {
                if (shouldLog('info')) {
                    await extra.sendNotification({
                        method: 'notifications/message',
                        params: { level: 'info', logger: 'test_tool_with_logging', data: message }
                    });
                }
                await sleep(50);
            }
            return text('Logging tool finished.');
        }
    );

    server.registerTool(
        'test_error_handling',
        { description: 'Fails on purpose, reported as a tool error rather than a protocol error.', inputSchema: {} },
        async () => {
            throw new Error('This is a test error from test_error_handling.');
        }
    );

    // The three tools below are the ones the migration rewrites: on 2025-11-25 a
    // server asks the client for something by opening a server-to-client request
    // and awaiting it. On 2026-07-28 there are no server-initiated requests, so
    // each of these becomes an input_required result the client fulfils on retry.

    server.registerTool(
        'test_sampling',
        {
            description: 'Asks the client to sample a completion for the given prompt.',
            inputSchema: { prompt: z.string().describe('The prompt to send to the model') }
        },
        async ({ prompt }, extra) => {
            const result = await server.server.createMessage(
                {
                    messages: [{ role: 'user', content: { type: 'text', text: prompt } }],
                    maxTokens: 100
                },
                { relatedRequestId: extra.requestId }
            );
            const content = result.content;
            return text(`LLM response: ${content?.type === 'text' ? content.text : 'non text content'}`);
        }
    );

    server.registerTool(
        'test_elicitation',
        {
            description: 'Asks the client to collect a username and an email from the user.',
            inputSchema: { message: z.string().describe('The message to show the user') }
        },
        async ({ message }, extra) => {
            const result = await server.server.elicitInput(
                {
                    message,
                    requestedSchema: {
                        type: 'object',
                        properties: {
                            username: { type: 'string', description: "User's response" },
                            email: { type: 'string', description: "User's email address" }
                        },
                        required: ['username', 'email']
                    }
                },
                { relatedRequestId: extra.requestId }
            );
            return text(`User response: action=${result.action}, content=${JSON.stringify(result.content ?? {})}`);
        }
    );

    server.registerTool(
        'test_elicitation_sep1034_defaults',
        { description: 'Elicits every primitive type with a default value (SEP-1034).', inputSchema: {} },
        async (_args, extra) => {
            const result = await server.server.elicitInput(
                {
                    message: 'Confirm your profile.',
                    requestedSchema: {
                        type: 'object',
                        properties: {
                            name: { type: 'string', description: 'Full name', default: 'John Doe' },
                            age: { type: 'integer', description: 'Age in years', default: 30 },
                            score: { type: 'number', description: 'Score out of 100', default: 95.5 },
                            status: {
                                type: 'string',
                                description: 'Account status',
                                enum: ['active', 'inactive', 'pending'],
                                default: 'active'
                            },
                            verified: { type: 'boolean', description: 'Whether the account is verified', default: true }
                        }
                    }
                },
                { relatedRequestId: extra.requestId }
            );
            return text(`Elicitation completed: action=${result.action}, content=${JSON.stringify(result.content ?? {})}`);
        }
    );

    server.registerTool(
        'test_elicitation_sep1330_enums',
        { description: 'Elicits every enum variant shape (SEP-1330).', inputSchema: {} },
        async (_args, extra) => {
            const result = await server.server.elicitInput(
                {
                    message: 'Pick your options.',
                    requestedSchema: {
                        type: 'object',
                        properties: {
                            untitledSingle: {
                                type: 'string',
                                description: 'Untitled single select',
                                enum: ['option1', 'option2', 'option3']
                            },
                            titledSingle: {
                                type: 'string',
                                description: 'Titled single select',
                                oneOf: [
                                    { const: 'value1', title: 'First Option' },
                                    { const: 'value2', title: 'Second Option' },
                                    { const: 'value3', title: 'Third Option' }
                                ]
                            },
                            legacyEnum: {
                                type: 'string',
                                description: 'Legacy titled select',
                                enum: ['opt1', 'opt2', 'opt3'],
                                enumNames: ['Option One', 'Option Two', 'Option Three']
                            },
                            untitledMulti: {
                                type: 'array',
                                description: 'Untitled multi select',
                                items: { type: 'string', enum: ['option1', 'option2', 'option3'] }
                            },
                            titledMulti: {
                                type: 'array',
                                description: 'Titled multi select',
                                items: {
                                    anyOf: [
                                        { const: 'value1', title: 'First Choice' },
                                        { const: 'value2', title: 'Second Choice' },
                                        { const: 'value3', title: 'Third Choice' }
                                    ]
                                }
                            }
                        }
                    }
                },
                { relatedRequestId: extra.requestId }
            );
            return text(`Elicitation completed: action=${result.action}, content=${JSON.stringify(result.content ?? {})}`);
        }
    );

    server.registerTool(
        'test_list_roots',
        { description: 'Asks the client which roots it exposes.', inputSchema: {} },
        async (_args, extra) => {
            const result = await server.server.listRoots(undefined, { relatedRequestId: extra.requestId });
            return text(`Roots: ${result.roots?.length ?? 0}`);
        }
    );

    server.registerTool(
        'test_trigger_tool_change',
        { description: 'Notifies the client that the tool list changed.', inputSchema: {} },
        async () => {
            server.sendToolListChanged();
            return text('Tool list change published.');
        }
    );

    server.registerTool(
        'test_trigger_prompt_change',
        { description: 'Notifies the client that the prompt list changed.', inputSchema: {} },
        async () => {
            server.sendPromptListChanged();
            return text('Prompt list change published.');
        }
    );

    // -------------------------------------------------------------- prompts

    server.registerPrompt(
        'test_simple_prompt',
        { description: 'A prompt with no arguments.' },
        () => ({
            messages: [{ role: 'user', content: { type: 'text', text: 'This is a simple prompt for testing.' } }]
        })
    );

    server.registerPrompt(
        'test_prompt_with_arguments',
        {
            description: 'A prompt that substitutes two arguments into its message.',
            argsSchema: {
                arg1: completable(z.string().describe('First argument'), value =>
                    ['alpha', 'beta', 'gamma', 'testValue1'].filter(candidate => candidate.startsWith(value))
                ),
                arg2: z.string().describe('Second argument')
            }
        },
        ({ arg1, arg2 }) => ({
            messages: [
                { role: 'user', content: { type: 'text', text: `Prompt with arguments: ${arg1} and ${arg2}` } }
            ]
        })
    );

    server.registerPrompt(
        'test_prompt_with_embedded_resource',
        {
            description: 'A prompt that embeds the resource named by its argument.',
            argsSchema: { resourceUri: z.string().describe('URI of the resource to embed') }
        },
        ({ resourceUri }) => ({
            messages: [
                { role: 'user', content: { type: 'text', text: 'Here is the resource you asked for:' } },
                {
                    role: 'user',
                    content: {
                        type: 'resource',
                        resource: {
                            uri: resourceUri,
                            mimeType: 'text/plain',
                            text: `Embedded content of ${resourceUri}`
                        }
                    }
                }
            ]
        })
    );

    server.registerPrompt(
        'test_prompt_with_image',
        { description: 'A prompt whose second message is an image.' },
        () => ({
            messages: [
                { role: 'user', content: { type: 'text', text: 'Here is an image:' } },
                { role: 'user', content: { type: 'image', data: PNG_1X1, mimeType: 'image/png' } }
            ]
        })
    );

    // ------------------------------------------------ resources and template

    server.registerResource(
        'static-text',
        'test://static-text',
        { description: 'A static text resource.', mimeType: 'text/plain' },
        async uri => ({
            contents: [
                {
                    uri: uri.href,
                    mimeType: 'text/plain',
                    text: 'This is the content of the static text resource.'
                }
            ]
        })
    );

    server.registerResource(
        'static-binary',
        'test://static-binary',
        { description: 'A static binary resource.', mimeType: 'image/png' },
        async uri => ({
            contents: [{ uri: uri.href, mimeType: 'image/png', blob: PNG_1X1 }]
        })
    );

    server.registerResource(
        'watched-resource',
        WATCHED_RESOURCE_URI,
        { description: 'A resource clients can subscribe to.', mimeType: 'text/plain' },
        async uri => ({
            contents: [{ uri: uri.href, mimeType: 'text/plain', text: 'This resource can be watched for updates.' }]
        })
    );

    server.registerResource(
        'template-data',
        new ResourceTemplate('test://template/{id}/data', { list: undefined }),
        {
            description: 'A templated resource whose id is substituted into its body.',
            mimeType: 'application/json'
        },
        async (uri, variables) => {
            const id = String(variables?.id ?? '');
            return {
                contents: [
                    {
                        uri: uri.href,
                        mimeType: 'application/json',
                        text: JSON.stringify({ id, templateTest: true, data: `Data for ID: ${id}` })
                    }
                ]
            };
        }
    );

    return server;
}

// ------------------------------------------------------------ HTTP transport

const app = express();
app.use(express.json());

// One transport per session, keyed by the Mcp-Session-Id the transport minted.
const transports = new Map();

const allowedHosts = [
    `localhost:${PORT}`,
    `127.0.0.1:${PORT}`,
    `[::1]:${PORT}`,
    'localhost',
    '127.0.0.1',
    '[::1]'
];
const allowedOrigins = [
    `http://localhost:${PORT}`,
    `http://127.0.0.1:${PORT}`,
    `http://[::1]:${PORT}`,
    'http://localhost',
    'http://127.0.0.1'
];

app.post(MCP_PATH, async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const existing = typeof sessionId === 'string' ? transports.get(sessionId) : undefined;

    if (existing) {
        await existing.handleRequest(req, res, req.body);
        return;
    }

    if (sessionId !== undefined) {
        res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32001, message: 'Session not found' },
            id: null
        });
        return;
    }

    // A session only starts on an initialize request; anything else without a
    // session id is a protocol error in this revision.
    if (!InitializeRequestSchema.safeParse(req.body).success) {
        res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Bad Request: server not initialized' },
            id: null
        });
        return;
    }

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: newSessionId => {
            transports.set(newSessionId, transport);
        },
        enableDnsRebindingProtection: true,
        allowedHosts,
        allowedOrigins
    });
    transport.onclose = () => {
        if (transport.sessionId) transports.delete(transport.sessionId);
    };

    await createServer().connect(transport);
    await transport.handleRequest(req, res, req.body);
});

// GET opens the standalone SSE stream the server pushes elicitation, sampling
// and roots requests onto; DELETE ends the session.
const handleSessionRequest = async (req, res) => {
    const sessionId = req.headers['mcp-session-id'];
    const transport = typeof sessionId === 'string' ? transports.get(sessionId) : undefined;
    if (!transport) {
        res.status(400).send('Invalid or missing session ID');
        return;
    }
    await transport.handleRequest(req, res);
};

app.get(MCP_PATH, handleSessionRequest);
app.delete(MCP_PATH, handleSessionRequest);

app.listen(PORT, '127.0.0.1', () => {
    console.error(`fixture before (2025-11-25) listening on http://127.0.0.1:${PORT}${MCP_PATH}`);
});
