import { FunctionResponseScheduling } from '@google/genai';
import { FunctionCall } from '../state';

export const modulatorTools: FunctionCall[] = [
  {
    name: 'dispatch_to_specialists',
    description: 'Dispatches one or more generated prompts to specialized models based on the detected intent. Use this tool to output the final prompts for the user\'s request. If the request spans multiple domains, provide a separate task for each domain.',
    parameters: {
      type: 'OBJECT',
      properties: {
        sharedContext: {
          type: 'STRING',
          description: 'A unifying theme, style, or overarching context that applies to all tasks in a multi-domain request. This ensures seamless continuity and alignment across all generated prompts for a unified output.',
        },
        tasks: {
          type: 'ARRAY',
          description: 'A list of tasks to dispatch to specialized models.',
          items: {
            type: 'OBJECT',
            properties: {
              detectedTaskType: {
                type: 'STRING',
                description: 'The primary objective and domain of the user\'s request (e.g., Image Generation, Code Creation).',
              },
              targetModelCategory: {
                type: 'STRING',
                description: 'The best specialized model category for the task (e.g., Image Editing, Scriptwriting).',
              },
              interpretedUserIntent: {
                type: 'STRING',
                description: 'A clear, operational summary of what the user actually wants to achieve.',
              },
              detailedPrompt: {
                type: 'STRING',
                description: 'The high-quality, detailed, and actionable prompt optimized for the specialized model.',
              },
              optionalNotesOrConstraints: {
                type: 'STRING',
                description: 'Any additional constraints, context, or notes for the execution.',
              },
            },
            required: ['detectedTaskType', 'targetModelCategory', 'interpretedUserIntent', 'detailedPrompt'],
          }
        }
      },
      required: ['tasks'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'search_memory',
    description: 'Searches the long-term conversation history database for past context or memories. Use this when the user asks about something discussed previously or asks you to recall past information.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'The search query or keywords to look for in past conversations.',
        }
      },
      required: ['query'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'execute_local_cli',
    description: 'Executes a local command line interface (CLI) command on the host machine. Use this for code generation tasks that require deploying the gemini cli, running local host cli control functions, or executing generated scripts.',
    parameters: {
      type: 'OBJECT',
      properties: {
        command: {
          type: 'STRING',
          description: 'The exact shell command to execute.',
        }
      },
      required: ['command'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'create_music_lyra',
    description: 'Generates music using the Lyra/Lyria model based on a detailed prompt. Use this when the user asks to create music, songs, or audio tracks.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'A detailed description of the music to generate, including genre, mood, instruments, and tempo.',
        }
      },
      required: ['prompt'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  },
  {
    name: 'generate_code',
    description: 'Generates code based on a detailed prompt. Use this when the user asks to write code, create scripts, or build applications.',
    parameters: {
      type: 'OBJECT',
      properties: {
        prompt: {
          type: 'STRING',
          description: 'A detailed description of the code to generate, including language, framework, and specific requirements.',
        }
      },
      required: ['prompt'],
    },
    isEnabled: true,
    scheduling: FunctionResponseScheduling.INTERRUPT,
  }
];
