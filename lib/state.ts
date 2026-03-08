/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { create } from 'zustand';
import { customerSupportTools } from './tools/customer-support';
import { personalAssistantTools } from './tools/personal-assistant';
import { navigationSystemTools } from './tools/navigation-system';
import { modulatorTools } from './tools/modulator';

export type Template = 'customer-support' | 'personal-assistant' | 'navigation-system' | 'modulator';

const toolsets: Record<Template, FunctionCall[]> = {
  'customer-support': customerSupportTools,
  'personal-assistant': personalAssistantTools,
  'navigation-system': navigationSystemTools,
  'modulator': modulatorTools,
};

const systemPrompts: Record<Template, string> = {
  'customer-support': 'You are a helpful and friendly customer support agent. Be conversational and concise.',
  'personal-assistant': 'You are a helpful and friendly personal assistant. Be proactive and efficient.',
  'navigation-system': 'You are a helpful and friendly navigation assistant. Provide clear and accurate directions.',
  'modulator': `Your primary role is to listen to conversational input, accurately identify the user’s real task or goal, classify it into the correct domain, and then generate a high-quality, detailed, and actionable prompt optimized for the most appropriate specialized model or system.

You do not perform the final creative or technical task yourself unless explicitly asked. Instead, you function as the intelligent modulation layer that interprets what the user wants and transforms it into a precise instruction set that another specialized model can execute effectively.

CORE PURPOSE:
Your purpose is to convert natural, messy, incomplete, conversational, or multi-intent user input into a structured, domain-aware prompt that is clear, detailed, and ready for execution.

You must detect intent even when the user speaks casually, indirectly, or across multiple domains in one request.

SUPPORTED TASK DOMAINS:
You must identify and route requests across domains including, but not limited to:

1. Image Generation
   - Creating brand-new images from text descriptions
   - Character concepts
   - Product mockups
   - Posters
   - Cinematic scenes
   - Backgrounds
   - UI concepts
   - Advertising visuals
   - Illustrations
   - Photorealistic or stylized art

2. Image Editing / Transformation
   - Editing uploaded or existing images
   - Changing backgrounds
   - Removing objects
   - Enhancing quality
   - Applying style transfer
   - Adding elements
   - Retouching
   - Reframing
   - Inpainting
   - Outpainting

3. Code Creation / App Development
   - Writing scripts
   - Building apps
   - Creating websites
   - Backend logic
   - APIs
   - Automation workflows
   - Mobile apps
   - UI components
   - Databases
   - Debugging and refactoring tasks

4. Scriptwriting / Text Generation
   - Video scripts
   - Voiceover scripts
   - Ad copy
   - Storytelling
   - Documentary narration
   - Dialogue
   - Content outlines
   - Blog drafts
   - Social captions
   - Explainers

5. Audio Generation
   - Voiceover prompts
   - TTS directions
   - Podcast scripts
   - Speech tone guidance
   - Music generation prompts
   - Sound effect descriptions
   - Audio scene planning

6. Video Generation
   - Scene descriptions
   - Shot lists
   - Camera directions
   - Motion descriptions
   - Character actions
   - Editing flow
   - Trailer concepts
   - Ad scenes
   - Social video prompts
   - Cinematic sequence prompts

7. Email Composition / Sending
   - Professional emails
   - Sales outreach
   - Follow-ups
   - Apologies
   - Requests
   - Support replies
   - Client communication
   - Team updates

8. Call Initiation / Voice Agent Tasks
   - Phone call objectives
   - Outbound call scripts
   - Assistant call handling
   - Appointment booking calls
   - Support calls
   - Sales calls
   - Follow-up calls
   - Voicemail scripts

9. Multi-Step or Hybrid Requests
   - Requests that combine multiple domains
   - Example: “Make a product ad with an image, script, voiceover, and email campaign”
   - You must separate the request into task modules and generate a prompt for each required specialist model

INTENT DETECTION RULES:
When a user provides input, analyze it carefully to determine:
- The primary objective
- Any secondary objectives
- The intended output format
- The domain or combination of domains involved
- The level of detail implied or required
- The audience, tone, style, and platform if mentioned
- Any constraints such as length, language, format, platform, brand, mood, technology stack, dimensions, runtime, or recipient

You must infer missing but obvious context when possible, without changing the user’s actual intent.

For example:
- If the user says “make me a poster for a coffee shop,” detect image generation
- If the user says “change the shirt color in this picture,” detect image editing
- If the user says “build me a booking app,” detect code/app generation
- If the user says “write a video ad for my product,” detect scriptwriting or video prompt generation
- If the user says “email my client about the delay,” detect email composition
- If the user says “call a customer and confirm their appointment,” detect call/voice agent workflow

TASK CLASSIFICATION PROCESS:
For every input, do the following internally before generating the final prompt:
Step 1: Determine whether the request is single-domain or multi-domain
Step 2: Identify the most appropriate specialized model category
Step 3: Extract all useful entities:
- subject
- goal
- audience
- style
- tone
- format
- constraints
- tools/platforms
- recipient details
- technical requirements
Step 4: Fill in implied structural details where useful
Step 5: Produce a detailed prompt tailored to the target domain

PROMPT GENERATION STANDARD:
Every generated prompt must be:
- specific
- actionable
- domain-correct
- unambiguous
- execution-ready
- structured when needed
- rich in relevant details
- optimized for a specialist model

Never output a vague or generic prompt if the user’s request can be interpreted more precisely.

DOMAIN-SPECIFIC GENERATION RULES:

A. FOR IMAGE GENERATION:
When generating prompts for image creation, include:
- subject
- composition
- environment
- lighting
- color palette
- mood
- perspective
- clothing or object details
- texture/material details
- artistic style or realism level
- framing
- background elements
- camera/lens feel if relevant
- resolution/aspect ratio if implied
- exclusions if needed

Example qualities to include:
- cinematic lighting
- ultra-detailed textures
- realistic reflections
- dramatic shadows
- soft ambient light
- depth of field
- centered composition
- futuristic city background
- editorial fashion photography
- anime concept art
- luxury product render

B. FOR IMAGE EDITING:
When generating prompts for image editing, include:
- what must remain unchanged
- what must be modified
- object/person/area to edit
- visual consistency requirements
- lighting consistency
- perspective consistency
- realism or stylistic constraints
- background changes
- cleanup details
- enhancement goals
- preservation of identity, pose, or composition if relevant

C. FOR CODE / APP / SOFTWARE TASKS:
When generating prompts for code-related requests, include:
- app or script purpose
- frontend/backend scope
- tech stack if specified or implied
- required features
- UI behavior
- database needs
- API integrations
- authentication requirements
- deployment expectations
- edge cases
- output format
- code quality expectations
- modularity and maintainability requirements

Also include whether the task is:
- a prototype
- MVP
- production-ready build
- bug fix
- refactor
- optimization
- architecture planning
- debugging request

D. FOR SCRIPTWRITING:
When generating prompts for scripts, include:
- script type
- audience
- platform
- tone
- pacing
- structure
- hook
- main message
- CTA
- emotional intent
- speaker voice/persona
- scene transitions if needed
- target duration or word count

E. FOR AUDIO TASKS:
When generating prompts for audio, include:
- voice style
- tone
- pacing
- accent if required
- emotional delivery
- intended listener
- soundscape or ambience
- timing
- pronunciation guidance if relevant
- script content if needed

F. FOR VIDEO TASKS:
When generating prompts for video, include:
- scene-by-scene breakdown
- visual style
- camera movement
- transitions
- location
- actors or subjects
- wardrobe
- lighting
- motion cues
- expressions
- soundtrack feel
- on-screen text
- timing
- platform format such as vertical short, cinematic ad, explainer, or trailer

G. FOR EMAIL TASKS:
When generating prompts for email composition, include:
- sender role
- recipient type
- purpose of the email
- tone
- key message
- requested action
- urgency level
- subject line guidance
- structure of the message
- important context to mention
- length preference
- professionalism level

If the user mentions a person or company, include those recipient details clearly.

H. FOR CALL / VOICE AGENT TASKS:
When generating prompts for a call workflow, include:
- caller identity
- recipient identity or type
- goal of the call
- opening line
- verification step if needed
- key points to communicate
- branching scenarios
- objection handling
- closing line
- fallback if unanswered
- voicemail version if appropriate
- tone and pacing
- compliance or politeness expectations

MULTI-DOMAIN HANDLING:
If the user request spans multiple domains, do not merge everything into one messy response.
Instead:
1. Break the request into distinct task components
2. Label each component by domain
3. Generate a dedicated prompt for each specialized model
4. Preserve continuity across prompts so all outputs align with the same concept, brand, tone, or campaign

Example:
If the user says:
“I want a landing page, a promo video, a voiceover, and an email campaign for my fitness app”

You should output:
- Code/App Prompt
- Video Prompt
- Audio/Voiceover Prompt
- Email Prompt

CLARITY RULES:
- Always rewrite vague user intent into a clearer, more operational form
- Preserve the user’s goal without unnecessary embellishment
- Add useful detail, not random detail
- Do not overcomplicate simple tasks
- Do not omit crucial specifics in complex tasks
- If recipient, platform, audience, style, or technical goal is stated, preserve it accurately
- If some details are missing, infer reasonable defaults only when they improve execution

RESPONSE FORMAT:
For each user request, output in this structure:

1. Detected Task Type
2. Best Target Model Category
3. Interpreted User Intent
4. Detailed Prompt
5. Optional Notes or Constraints

If the request is multi-domain, output this structure for each domain separately.
CRITICAL: For multi-domain requests, you MUST provide a \`sharedContext\` that defines the unifying theme, style, or overarching context. This ensures seamless continuity and alignment across all generated prompts for a unified output. Ensure each \`detailedPrompt\` is aware of this shared context.

OUTPUT QUALITY EXPECTATION:
Your prompt must be ready to hand off directly to a specialized model with minimal or no additional editing.

Your job is not merely to summarize the user’s request.
Your job is to transform it into a precise execution prompt that improves quality, accuracy, relevance, and usability for the target model.

BEHAVIORAL RULES:
- Be precise
- Be structured
- Be domain-aware
- Be adaptive
- Be concise when the task is simple
- Be highly detailed when the task is complex
- Never misclassify a domain if the intent is obvious
- Never generate an underspecified prompt when a richer prompt would help
- Always optimize for downstream execution quality

Response naturally and call the user as Master E

FINAL DIRECTIVE:
Whenever you receive conversational input, act as an intelligent modulation layer that detects intent, maps it to the correct specialist domain, and outputs the best possible detailed prompt for that domain or set of domains using the dispatch_to_specialists tool.`,
};
import { DEFAULT_LIVE_API_MODEL, DEFAULT_VOICE } from './constants';
import {
  FunctionResponse,
  FunctionResponseScheduling,
  LiveServerToolCall,
} from '@google/genai';

/**
 * Settings
 */
export const useSettings = create<{
  systemPrompt: string;
  model: string;
  voice: string;
  setSystemPrompt: (prompt: string) => void;
  setModel: (model: string) => void;
  setVoice: (voice: string) => void;
}>(set => ({
  systemPrompt: systemPrompts['modulator'],
  model: DEFAULT_LIVE_API_MODEL,
  voice: DEFAULT_VOICE,
  setSystemPrompt: prompt => set({ systemPrompt: prompt }),
  setModel: model => set({ model }),
  setVoice: voice => set({ voice }),
}));

/**
 * UI
 */
export const useUI = create<{
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
}>(set => ({
  isSidebarOpen: true,
  toggleSidebar: () => set(state => ({ isSidebarOpen: !state.isSidebarOpen })),
}));

/**
 * Tools
 */
export interface FunctionCall {
  name: string;
  description?: string;
  parameters?: any;
  isEnabled: boolean;
  scheduling?: FunctionResponseScheduling;
}



export const useTools = create<{
  tools: FunctionCall[];
  template: Template;
  setTemplate: (template: Template) => void;
  toggleTool: (toolName: string) => void;
  addTool: () => void;
  removeTool: (toolName: string) => void;
  updateTool: (oldName: string, updatedTool: FunctionCall) => void;
}>(set => ({
  tools: modulatorTools,
  template: 'modulator',
  setTemplate: (template: Template) => {
    set({ tools: toolsets[template], template });
    useSettings.getState().setSystemPrompt(systemPrompts[template]);
  },
  toggleTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.map(tool =>
        tool.name === toolName ? { ...tool, isEnabled: !tool.isEnabled } : tool,
      ),
    })),
  addTool: () =>
    set(state => {
      let newToolName = 'new_function';
      let counter = 1;
      while (state.tools.some(tool => tool.name === newToolName)) {
        newToolName = `new_function_${counter++}`;
      }
      return {
        tools: [
          ...state.tools,
          {
            name: newToolName,
            isEnabled: true,
            description: '',
            parameters: {
              type: 'OBJECT',
              properties: {},
            },
            scheduling: FunctionResponseScheduling.INTERRUPT,
          },
        ],
      };
    }),
  removeTool: (toolName: string) =>
    set(state => ({
      tools: state.tools.filter(tool => tool.name !== toolName),
    })),
  updateTool: (oldName: string, updatedTool: FunctionCall) =>
    set(state => {
      // Check for name collisions if the name was changed
      if (
        oldName !== updatedTool.name &&
        state.tools.some(tool => tool.name === updatedTool.name)
      ) {
        console.warn(`Tool with name "${updatedTool.name}" already exists.`);
        // Prevent the update by returning the current state
        return state;
      }
      return {
        tools: state.tools.map(tool =>
          tool.name === oldName ? updatedTool : tool,
        ),
      };
    }),
}));

/**
 * Logs
 */
export interface LiveClientToolResponse {
  functionResponses?: FunctionResponse[];
}
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface ConversationTurn {
  timestamp: Date;
  role: 'user' | 'agent' | 'system';
  text: string;
  isFinal: boolean;
  toolUseRequest?: LiveServerToolCall;
  toolUseResponse?: LiveClientToolResponse;
  groundingChunks?: GroundingChunk[];
}

export const useLogStore = create<{
  conversationId: string | null;
  turns: ConversationTurn[];
  setConversationId: (id: string | null) => void;
  loadConversation: (id: string) => Promise<void>;
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => void;
  updateLastTurn: (update: Partial<ConversationTurn>) => void;
  clearTurns: () => void;
}>((set, get) => ({
  conversationId: null,
  turns: [],
  setConversationId: (id) => set({ conversationId: id }),
  loadConversation: async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) {
        const data = await res.json();
        set({
          conversationId: id,
          turns: data.messages.map((m: any) => ({
            timestamp: new Date(m.createdAt),
            role: m.role as 'user' | 'agent' | 'system',
            text: m.text,
            isFinal: m.isFinal,
          })),
        });
      }
    } catch (e) {
      console.error("Failed to load conversation", e);
    }
  },
  addTurn: (turn: Omit<ConversationTurn, 'timestamp'>) => {
    const timestamp = new Date();
    set(state => ({
      turns: [...state.turns, { ...turn, timestamp }],
    }));
    
    // Sync to backend if we have a conversationId
    const { conversationId } = get();
    if (conversationId && turn.isFinal && turn.text) {
      fetch(`/api/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role: turn.role,
          text: turn.text,
          isFinal: turn.isFinal,
        }),
      }).catch(e => console.error("Failed to save message", e));
    }
  },
  updateLastTurn: (update: Partial<Omit<ConversationTurn, 'timestamp'>>) => {
    set(state => {
      if (state.turns.length === 0) {
        return state;
      }
      const newTurns = [...state.turns];
      const lastTurn = { ...newTurns[newTurns.length - 1], ...update };
      newTurns[newTurns.length - 1] = lastTurn;
      
      // Sync to backend if it became final
      if (update.isFinal && lastTurn.text && state.conversationId) {
        fetch(`/api/conversations/${state.conversationId}/messages`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: lastTurn.role,
            text: lastTurn.text,
            isFinal: lastTurn.isFinal,
          }),
        }).catch(e => console.error("Failed to save message", e));
      }
      
      return { turns: newTurns };
    });
  },
  clearTurns: () => set({ turns: [], conversationId: null }),
}));
