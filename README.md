# Flow Execution Engine Logging System

This document explains the logging system implemented for the Flow Execution Engine, which helps track and debug the execution of flows.

## Overview

The Flow Execution Engine now includes comprehensive logging that tracks every step of the flow execution process, including:

- Flow execution start and end
- Node execution details
- API requests and responses
- Data transfers between nodes
- Execution context updates
- Error handling

## Log Levels

The logging system supports different log levels:

- **ERROR**: Critical errors that prevent execution
- **WARN**: Warning messages that don't stop execution but indicate potential issues
- **INFO**: General information about the execution process
- **DEBUG**: Detailed information useful for debugging
- **SILLY/TRACE**: Very detailed information for tracing execution flow

## Running with Different Log Levels

You can run the application with different log levels using the following npm scripts:

```bash
# Normal development mode (INFO level logs)
npm run dev

# Debug mode (DEBUG level logs)
npm run dev:debug

# Trace mode (SILLY level logs - most verbose)
npm run dev:trace

# Production mode with debug logs
npm run start:debug
```

## Log Files

Logs are written to the following files:

- `logs/flow.log`: Contains all logs
- `logs/flow-error.log`: Contains only error logs
- Console output: Formatted logs are also displayed in the console

## Understanding Log Output

Each log entry includes:

- Timestamp
- Log level
- Message
- Additional metadata (when available)

Example log entry:
```
2025-04-19 22:05:30 ℹ️ [FLOW ENGINE] INFO: Flow execution completed successfully {"event":"flow_execution_end","taskId":"12345","success":true}
```

## Debugging Flow Execution

To debug flow execution issues:

1. Run the application with debug logs: `npm run dev:debug`
2. Check the logs for any errors or warnings
3. Look for specific node execution details
4. Examine API request and response data
5. Track data transfers between nodes

## Common Issues and Solutions

### Missing Starting Node

If you see an error like "No matching starting node found for task type", check:
- The task type matches a condition node with `isStartingPoint: true`
- The condition node's `returnText` matches the task type

### API Request Failures

If API requests are failing, look for:
- API request logs with details about the request
- API error logs with error messages
- Check if path parameters and query parameters are correctly set
- Verify authentication configuration

### Data Transfer Issues

If data isn't flowing correctly between nodes:
- Check the data transfer logs to see what data is being passed
- Verify source and target handles are correctly connected
- Examine the execution context updates to see if data is being stored correctly

## Customizing Logging

You can customize the logging level by setting the `LOG_LEVEL` environment variable:

```bash
# Set log level to debug
LOG_LEVEL=debug npm run dev

# Set log level to error only
LOG_LEVEL=error npm run dev
```

Available log levels: error, warn, info, debug, silly
