/*
  09_cortex_agent.sql
  Creates the PRODUCT_WHEEL_AGENT Cortex Agent with 8 tools:
    5 Cortex Analyst (semantic views) + 1 Cortex Search + 1 Custom UDF + 1 data_to_chart
*/

USE DATABASE PRODUCT_WHEEL_OPT;
USE SCHEMA DATA_MART;
USE WAREHOUSE PRODUCT_WHEEL_SCHEDULE_OPTIMIZATION_WH;

CREATE OR REPLACE CORTEX AGENT PRODUCT_WHEEL_AGENT
  COMMENT = 'Manufacturing copilot for Snowcore Contract Manufacturing product wheel schedule optimization'
  MODEL = 'claude-3-5-sonnet'
  TOOLS = (
    {
      'tool_spec': {
        'type': 'cortex_analyst_text_to_sql',
        'name': 'SCHEDULE_ANALYST',
        'description': 'Answers questions about the optimized production schedule, product wheel Gantt charts, production quantities, line assignments, and schedule utilization. Use when the user asks about what is being produced, when, on which line, or how much is planned.'
      },
      'tool_resources': {
        'semantic_view': 'PRODUCT_WHEEL_OPT.DATA_MART.SCHEDULE_ANALYST_VIEW'
      }
    },
    {
      'tool_spec': {
        'type': 'cortex_analyst_text_to_sql',
        'name': 'DEMAND_ANALYST',
        'description': 'Answers questions about customer demand forecasts, volumes, trends, and distribution by customer, product family, and time period. Use when the user asks about demand, forecasts, or what customers are ordering.'
      },
      'tool_resources': {
        'semantic_view': 'PRODUCT_WHEEL_OPT.DATA_MART.DEMAND_ANALYST_VIEW'
      }
    },
    {
      'tool_spec': {
        'type': 'cortex_analyst_text_to_sql',
        'name': 'INVENTORY_ANALYST',
        'description': 'Answers questions about current inventory levels, safety stock, days of supply, and stock health by product and plant. Use when the user asks about inventory, stock levels, or safety stock positions.'
      },
      'tool_resources': {
        'semantic_view': 'PRODUCT_WHEEL_OPT.DATA_MART.INVENTORY_ANALYST_VIEW'
      }
    },
    {
      'tool_spec': {
        'type': 'cortex_analyst_text_to_sql',
        'name': 'CONTRACT_ANALYST',
        'description': 'Answers questions about customer contracts, SLA targets, fill rate compliance, pricing, and priority tiers. Use when the user asks about SLAs, contracts, compliance, or which customers are at risk.'
      },
      'tool_resources': {
        'semantic_view': 'PRODUCT_WHEEL_OPT.DATA_MART.CONTRACT_ANALYST_VIEW'
      }
    },
    {
      'tool_spec': {
        'type': 'cortex_analyst_text_to_sql',
        'name': 'CHANGEOVER_ANALYST',
        'description': 'Answers questions about changeover times and costs between products on production lines. Use when the user asks about changeover matrices, transition times, cleaning requirements, or switching costs.'
      },
      'tool_resources': {
        'semantic_view': 'PRODUCT_WHEEL_OPT.DATA_MART.CHANGEOVER_ANALYST_VIEW'
      }
    },
    {
      'tool_spec': {
        'type': 'cortex_search',
        'name': 'PROCESS_DOCS',
        'description': 'Searches Snowcore manufacturing process documentation including SOPs, changeover procedures, CIP cleaning protocols, allergen control, quality standards, inventory policies, scheduling workflows, and troubleshooting guides. Use when the user asks about procedures, policies, how things work, or manufacturing processes.'
      },
      'tool_resources': {
        'cortex_search_service': 'PRODUCT_WHEEL_OPT.RAW.CONTRACT_MFG_SEARCH_SERVICE'
      }
    },
    {
      'tool_spec': {
        'type': 'function',
        'name': 'SAVE_NOTE',
        'description': 'Saves a user note, comment, action item, question, or concern. Use when the user wants to record a note, create an action item, log a concern, or save a comment about something they observed. Extract the note text, classify the type (comment, action_item, concern, question), and determine the relevant page context and entity.',
        'parameters': [
          {
            'name': 'page_context',
            'type': 'string',
            'description': 'Which page this note is relevant to: overview, explorer, results, studio, contracts, or global'
          },
          {
            'name': 'entity_type',
            'type': 'string',
            'description': 'Type of entity this note is about: scenario, line, product, customer, contract, or general'
          },
          {
            'name': 'entity_id',
            'type': 'string',
            'description': 'Identifier of the specific entity, e.g. scenario_id, line_code, product_code, customer_name'
          },
          {
            'name': 'note_text',
            'type': 'string',
            'description': 'The actual note content to save'
          },
          {
            'name': 'note_type',
            'type': 'string',
            'description': 'Classification: comment, action_item, concern, or question'
          }
        ]
      },
      'tool_resources': {
        'function': 'PRODUCT_WHEEL_OPT.DATA_MART.SAVE_USER_NOTE'
      }
    },
    {
      'tool_spec': {
        'type': 'data_to_chart',
        'name': 'VISUALIZE',
        'description': 'Creates Vega-Lite chart visualizations from data. Use after querying data when a visual representation would help the user understand the results.'
      }
    }
  );

GRANT USAGE ON CORTEX AGENT PRODUCT_WHEEL_AGENT TO ROLE PUBLIC;
