// ==================== CHATBOT.JS - AI-Powered Chatbot ====================
window.LMS = window.LMS || {};

LMS.Chatbot = () => {
    const { students, payments, halls, shifts, settings } = useContext(LMS.AppContext);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { sender: 'bot', text: 'Hello! 👋 I can help you with student info. Try:\n• Enter a roll number\n• "list" - show all students\n• "search [name]" - find students\n• "dues" - show students with dues\n• "stats" - show statistics' }
    ]);
    const [input, setInput] = useState('');
    const messagesEndRef = useRef(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const processCommand = (cmd) => {
        const lower = cmd.toLowerCase().trim();

        // Statistics
        if (lower === 'stats' || lower === 'statistics') {
            const active = students.filter(s => s.isActive).length;
            const totalSeats = halls.reduce((a, h) => a + h.seatCount, 0);
            const occupied = students.filter(s => s.assignedSeat && s.isActive).length;
            const dueCount = students.filter(s => s.isActive && LMS.getDueAmount(s, payments) > 0).length;
            return `📊 **Statistics:**\n• Active Students: ${active}\n• Total Seats: ${totalSeats}\n• Occupied: ${occupied}\n• Available: ${totalSeats - occupied}\n• Students with Dues: ${dueCount}`;
        }

        // List all students
        if (lower === 'list' || lower === 'all') {
            const active = students.filter(s => s.isActive).slice(0, 15);
            if (active.length === 0) return 'No active students found.';
            return `📋 **Active Students (${active.length}):**\n` + active.map(s => `• ${s.rollNo} - ${s.name}`).join('\n');
        }

        // Show dues
        if (lower === 'dues' || lower === 'pending') {
            const dueStudents = students.filter(s => s.isActive && LMS.getDueAmount(s, payments) > 0)
                .sort((a, b) => LMS.getDueAmount(b, payments) - LMS.getDueAmount(a, payments))
                .slice(0, 10);
            if (dueStudents.length === 0) return '✅ No students with pending dues!';
            return `⚠️ **Students with Dues:**\n` + dueStudents.map(s =>
                `• ${s.rollNo} - ${s.name}: ₹${LMS.getDueAmount(s, payments)}`
            ).join('\n');
        }

        // Help
        if (lower === 'help') {
            return `📖 **Commands:**\n• [roll number] - Get student details\n• "list" - Show all students\n• "search [name]" - Find students\n• "dues" - Students with dues\n• "stats" - Statistics\n• "help" - Show this help`;
        }

        // Search
        if (lower.startsWith('search ')) {
            const query = lower.replace('search ', '').trim();
            const results = students.filter(s =>
                s.name.toLowerCase().includes(query) ||
                s.rollNo.toLowerCase().includes(query)
            ).slice(0, 10);
            if (results.length === 0) return `No students found for "${query}"`;
            return `🔍 **Search Results:**\n` + results.map(s => `• ${s.rollNo} - ${s.name} (${s.isActive ? 'Active' : 'Inactive'})`).join('\n');
        }

        // Student by roll number
        const student = students.find(s => s.rollNo.toLowerCase() === lower);
        if (student) {
            const fin = LMS.calculateStudentFinancials(student, payments);
            const shift = shifts.find(sh => sh.id === student.shift);
            return `👤 **${student.name}**\n• Roll: ${student.rollNo}\n• Mobile: ${student.mobile || 'N/A'}\n• Shift: ${shift?.name || student.shift}\n• Fee: ₹${student.monthlyFee}/month\n• Paid Until: ${LMS.formatDate(fin.paidUntil)}\n• Status: ${fin.totalDues > 0 ? `⚠️ Due: ₹${fin.totalDues}` : '✅ Paid'}\n• Seat: ${student.assignedSeat || 'Not assigned'}`;
        }

        return `❓ I didn't understand "${cmd}". Type "help" for available commands.`;
    };

    const handleSend = () => {
        if (!input.trim()) return;

        const userMsg = { sender: 'user', text: input };
        const botResponse = { sender: 'bot', text: processCommand(input) };

        setMessages(prev => [...prev, userMsg, botResponse]);
        setInput('');
    };

    const handleKeyPress = (e) => {
        if (e.key === 'Enter') handleSend();
    };

    return html`<div>
    <!-- Chatbot Button -->
    <button 
      onClick=${() => setIsOpen(!isOpen)} 
      class="chatbot-button animate-pulsate"
      title="Chat with AI Assistant"
    >
      ${isOpen ? '✕' : '💬'}
    </button>

    <!-- Chatbot Modal -->
    ${isOpen && html`
      <div class="chatbot-modal">
        <div class="chatbot-header">
          <span>🤖 Library Assistant</span>
          <button 
            onClick=${() => setIsOpen(false)}
            style=${{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', fontSize: '1.25rem' }}
          >✕</button>
        </div>
        
        <div class="chatbot-messages">
          ${messages.map((msg, i) => html`
            <div key=${i} class="chatbot-message ${msg.sender}">
              ${msg.text.split('\n').map((line, j) => html`<div key=${j}>${line}</div>`)}
            </div>
          `)}
          <div ref=${messagesEndRef} />
        </div>

        <div class="chatbot-input">
          <input 
            type="text"
            value=${input}
            onChange=${e => setInput(e.target.value)}
            onKeyDown=${handleKeyPress}
            placeholder="Type a command..."
          />
          <button onClick=${handleSend}>Send</button>
        </div>
      </div>
    `}
  </div>`;
};
