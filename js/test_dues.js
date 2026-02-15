
// Mock LMS Context
const LMS = {};

LMS.calculateStudentFinancials = (student, payments) => {
    if (!student || !student.admissionDate || !student.monthlyFee || !student.isActive) {
        return { totalDues: 0, paidUntil: null, amountPaid: 0, overpaid: 0, dueSince: null, daysDue: 0, paidMonths: 0, log: "Invalid input" };
    }

    const feeAmount = Number(student.monthlyFee);
    const admissionDate = new Date(student.admissionDate);
    const admissionDay = admissionDate.getDate();
    const today = new Date(); // Uses system time (2026-02-07)
    today.setHours(0, 0, 0, 0);

    const limitDate = student.deactivatedAt ? new Date(student.deactivatedAt) : today;

    console.log("Admission Date:", admissionDate.toISOString());
    console.log("Limit Date:", limitDate.toISOString());

    // Total amount paid
    const studentPayments = (payments || []).filter(p => p.studentId === student.id);
    const currentPaidAmount = studentPayments.reduce((sum, p) => sum + (Number(p.amount) || 0) + (Number(p.discount) || 0), 0);

    console.log("Current Paid:", currentPaidAmount);

    // Fee changes tracking
    const feeChanges = [...(student.feeChanges || []), { date: admissionDate.toISOString(), fee: feeAmount }]
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    console.log("Fee Changes:", feeChanges);

    // Calculate paidUntil
    let tempPaidAmount = currentPaidAmount;
    let currentCycleStart = new Date(admissionDate);
    currentCycleStart.setHours(0, 0, 0, 0);
    let paidMonths = 0;
    let feeChangeIndex = 0;
    let currentFee = feeChanges[0].fee;
    let paidUpToDate = new Date(admissionDate);
    paidUpToDate.setHours(0, 0, 0, 0);

    while (tempPaidAmount >= currentFee && currentFee > 0) {
        tempPaidAmount -= currentFee;
        let nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, admissionDay);
        let adjusted = false;
        if (nextCycleStart.getMonth() !== (currentCycleStart.getMonth() + 1) % 12) {
            nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 2, 0);
            adjusted = true;
        }

        while (feeChangeIndex < feeChanges.length - 1 && new Date(feeChanges[feeChangeIndex + 1].date) < nextCycleStart) {
            feeChangeIndex++;
            currentFee = feeChanges[feeChangeIndex].fee;
        }

        paidUpToDate = new Date(nextCycleStart);
        if (!adjusted) paidUpToDate.setDate(paidUpToDate.getDate() - 1);
        paidMonths++;
        currentCycleStart = nextCycleStart;
        if (paidMonths > 1200) break;
    }

    // Calculate totalExpectedDues
    let totalExpectedDues = 0;
    currentCycleStart = new Date(admissionDate);
    currentCycleStart.setHours(0, 0, 0, 0);
    feeChangeIndex = 0;
    currentFee = feeChanges[0].fee;
    // IMPORTANT: Are we resetting currentFee correctly based on sorted array?
    // If feeChanges[0] is BEFORE admission, it is used.
    // But logic above added { date: admissionDate, fee } and sorted.

    let cycles = 0;

    while (currentCycleStart <= limitDate) {
        let nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 1, admissionDay);
        if (nextCycleStart.getMonth() !== (currentCycleStart.getMonth() + 1) % 12) {
            nextCycleStart = new Date(currentCycleStart.getFullYear(), currentCycleStart.getMonth() + 2, 0);
        }

        while (feeChangeIndex < feeChanges.length - 1 && new Date(feeChanges[feeChangeIndex + 1].date) < nextCycleStart) {
            feeChangeIndex++;
            currentFee = feeChanges[feeChangeIndex].fee;
        }

        console.log(`Cycle ${cycles}: ${currentCycleStart.toISOString()} Fee: ${currentFee}`);

        totalExpectedDues += currentFee;
        currentCycleStart = nextCycleStart;
        cycles++;
        if (cycles > 1200) {
            console.log("Hit Safety Limit 1200");
            break;
        }
    }

    console.log("Total Expected Dues:", totalExpectedDues);
    let remainingDues = totalExpectedDues - currentPaidAmount;
    return {
        totalDues: remainingDues
    };
};

const student = {
    id: "suraj",
    admissionDate: "2025-07-29",
    monthlyFee: 500,
    isActive: true, // Assuming active
    feeChanges: [
        { date: "2025-10-22T13:10:32.657Z", fee: 400 },
        { date: "2025-10-22T13:11:26.885Z", fee: 1050 }
    ],
    // The snippet showed deactivatedAt: null for previous student, assuming null here too
    deactivatedAt: null
};

// Also test with explicit deactivatedAt future date just in case
const studentWithDeactivation = { ...student, isActive: true, deactivatedAt: "2125-01-01" };

console.log("--- Test 1: Normal ---");
console.log(LMS.calculateStudentFinancials(student, []));
console.log("\n--- Test 2: Future Deactivation ---");
console.log(LMS.calculateStudentFinancials(studentWithDeactivation, []));

