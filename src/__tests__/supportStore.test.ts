/**
 * Tests for useSupportStore — support ticket CRUD, message sending,
 * loading/error state management, and clearUserData.
 */

jest.mock('../services/supportService', () => ({
  supportService: {
    getMyTickets: jest.fn(() => Promise.resolve([])),
    getTicket: jest.fn(() => Promise.resolve(null)),
    createTicket: jest.fn(() => Promise.resolve({})),
    sendMessage: jest.fn(() => Promise.resolve({})),
    closeTicket: jest.fn(() => Promise.resolve({})),
  },
}));

import { useSupportStore } from '../store/useSupportStore';
import { supportService } from '../services/supportService';

const mockGetMyTickets = supportService.getMyTickets as jest.Mock;
const mockGetTicket = supportService.getTicket as jest.Mock;
const mockCreateTicket = supportService.createTicket as jest.Mock;
const mockSendMessage = supportService.sendMessage as jest.Mock;
const mockCloseTicket = supportService.closeTicket as jest.Mock;

const resetStore = () =>
  useSupportStore.setState({
    tickets: [],
    activeTicket: null,
    loading: false,
    sending: false,
    error: null,
  });

const sampleTicket = {
  id: 't-001',
  subject: 'Cannot log in',
  category: 'account' as const,
  status: 'open',
  priority: 'normal',
  createdAt: '2026-04-20T10:00:00.000Z',
  updatedAt: '2026-04-20T10:00:00.000Z',
  messages: [],
  assignedTo: null,
};

const sampleMessage = {
  id: 'm-001',
  content: 'Hello, I need help',
  isStaff: false,
  createdAt: '2026-04-20T10:05:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  resetStore();
  mockGetMyTickets.mockResolvedValue([]);
  mockGetTicket.mockResolvedValue(null);
  mockCreateTicket.mockResolvedValue(sampleTicket);
  mockSendMessage.mockResolvedValue(sampleMessage);
  mockCloseTicket.mockResolvedValue({ ...sampleTicket, status: 'closed' });
});

// ─── fetchMyTickets ───────────────────────────────────────────────────────────

describe('fetchMyTickets', () => {
  test('sets loading true while fetching, then false on success', async () => {
    let loadingDuringFetch = false;
    mockGetMyTickets.mockImplementationOnce(async () => {
      loadingDuringFetch = useSupportStore.getState().loading;
      return [sampleTicket];
    });

    await useSupportStore.getState().fetchMyTickets();

    expect(loadingDuringFetch).toBe(true);
    expect(useSupportStore.getState().loading).toBe(false);
  });

  test('populates tickets on success', async () => {
    mockGetMyTickets.mockResolvedValueOnce([sampleTicket]);

    await useSupportStore.getState().fetchMyTickets();

    const { tickets } = useSupportStore.getState();
    expect(tickets).toHaveLength(1);
    expect(tickets[0].id).toBe('t-001');
  });

  test('sets error message on failure', async () => {
    mockGetMyTickets.mockRejectedValueOnce(new Error('Network error'));

    await useSupportStore.getState().fetchMyTickets();

    const { error, loading } = useSupportStore.getState();
    expect(error).toBe('Не удалось загрузить обращения');
    expect(loading).toBe(false);
  });
});

// ─── fetchTicket ──────────────────────────────────────────────────────────────

describe('fetchTicket', () => {
  test('sets activeTicket on success', async () => {
    mockGetTicket.mockResolvedValueOnce(sampleTicket);

    await useSupportStore.getState().fetchTicket('t-001');

    expect(useSupportStore.getState().activeTicket?.id).toBe('t-001');
    expect(useSupportStore.getState().loading).toBe(false);
  });

  test('sets error on failure', async () => {
    mockGetTicket.mockRejectedValueOnce(new Error('Not found'));

    await useSupportStore.getState().fetchTicket('bad-id');

    expect(useSupportStore.getState().error).toBe('Не удалось загрузить обращение');
    expect(useSupportStore.getState().activeTicket).toBeNull();
  });
});

// ─── createTicket ─────────────────────────────────────────────────────────────

describe('createTicket', () => {
  const ticketData = {
    subject: 'Cannot log in',
    category: 'account' as const,
    message: 'I cannot access my account.',
  };

  test('prepends new ticket to tickets list on success', async () => {
    useSupportStore.setState({ tickets: [{ ...sampleTicket, id: 't-existing' }] });

    await useSupportStore.getState().createTicket(ticketData);

    const { tickets } = useSupportStore.getState();
    expect(tickets).toHaveLength(2);
    expect(tickets[0].id).toBe('t-001'); // new ticket prepended
    expect(tickets[1].id).toBe('t-existing');
  });

  test('returns created ticket', async () => {
    const result = await useSupportStore.getState().createTicket(ticketData);

    expect(result.id).toBe('t-001');
    expect(result.subject).toBe('Cannot log in');
  });

  test('sets error and throws on failure', async () => {
    mockCreateTicket.mockRejectedValueOnce(new Error('Server error'));

    await expect(useSupportStore.getState().createTicket(ticketData)).rejects.toThrow();

    expect(useSupportStore.getState().error).toBe('Не удалось создать обращение');
    expect(useSupportStore.getState().sending).toBe(false);
  });

  test('sets sending=true during request, then false on success', async () => {
    let sendingDuring = false;
    mockCreateTicket.mockImplementationOnce(async () => {
      sendingDuring = useSupportStore.getState().sending;
      return sampleTicket;
    });

    await useSupportStore.getState().createTicket(ticketData);

    expect(sendingDuring).toBe(true);
    expect(useSupportStore.getState().sending).toBe(false);
  });
});

// ─── sendMessage ──────────────────────────────────────────────────────────────

describe('sendMessage', () => {
  test('appends message to activeTicket.messages', async () => {
    useSupportStore.setState({
      activeTicket: { ...sampleTicket, id: 't-001', messages: [] },
    });

    await useSupportStore.getState().sendMessage('t-001', 'Hello');

    const { activeTicket } = useSupportStore.getState();
    expect(activeTicket?.messages).toHaveLength(1);
    expect(activeTicket?.messages[0].content).toBe('Hello, I need help');
  });

  test('does nothing to messages if activeTicket is a different ticket', async () => {
    useSupportStore.setState({
      activeTicket: { ...sampleTicket, id: 't-other', messages: [] },
    });

    await useSupportStore.getState().sendMessage('t-001', 'Hello');

    // activeTicket.id !== 't-001', so messages unchanged
    expect(useSupportStore.getState().activeTicket?.messages).toHaveLength(0);
  });

  test('sets error on failure', async () => {
    mockSendMessage.mockRejectedValueOnce(new Error('Failed'));

    await useSupportStore.getState().sendMessage('t-001', 'Hello');

    expect(useSupportStore.getState().error).toBe('Не удалось отправить сообщение');
  });
});

// ─── closeTicket ──────────────────────────────────────────────────────────────

describe('closeTicket', () => {
  test('updates ticket status in list', async () => {
    useSupportStore.setState({ tickets: [sampleTicket] });

    await useSupportStore.getState().closeTicket('t-001');

    const { tickets } = useSupportStore.getState();
    expect(tickets[0].status).toBe('closed');
  });

  test('updates activeTicket if it is the closed ticket', async () => {
    useSupportStore.setState({
      tickets: [sampleTicket],
      activeTicket: sampleTicket,
    });

    await useSupportStore.getState().closeTicket('t-001');

    expect(useSupportStore.getState().activeTicket?.status).toBe('closed');
  });

  test('does not update activeTicket if it is a different ticket', async () => {
    useSupportStore.setState({
      tickets: [sampleTicket],
      activeTicket: { ...sampleTicket, id: 't-other', status: 'open' },
    });

    await useSupportStore.getState().closeTicket('t-001');

    // activeTicket unchanged because it's a different ticket
    expect(useSupportStore.getState().activeTicket?.status).toBe('open');
    expect(useSupportStore.getState().activeTicket?.id).toBe('t-other');
  });

  test('sets error on failure', async () => {
    mockCloseTicket.mockRejectedValueOnce(new Error('Failed'));

    await useSupportStore.getState().closeTicket('t-001');

    expect(useSupportStore.getState().error).toBe('Не удалось закрыть обращение');
  });
});

// ─── utility actions ──────────────────────────────────────────────────────────

describe('utility actions', () => {
  test('clearActive sets activeTicket to null', () => {
    useSupportStore.setState({ activeTicket: sampleTicket });

    useSupportStore.getState().clearActive();

    expect(useSupportStore.getState().activeTicket).toBeNull();
  });

  test('clearError sets error to null', () => {
    useSupportStore.setState({ error: 'Some error' });

    useSupportStore.getState().clearError();

    expect(useSupportStore.getState().error).toBeNull();
  });

  test('clearUserData resets all state', () => {
    useSupportStore.setState({
      tickets: [sampleTicket],
      activeTicket: sampleTicket,
      error: 'An error',
    });

    useSupportStore.getState().clearUserData();

    const s = useSupportStore.getState();
    expect(s.tickets).toHaveLength(0);
    expect(s.activeTicket).toBeNull();
    expect(s.error).toBeNull();
  });
});
