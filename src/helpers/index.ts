import { Request, Response } from 'express';
import { nextFriday, nextMonday, nextSaturday, nextSunday, nextThursday, nextTuesday, nextWednesday } from "date-fns";
import { WeeklyQueueTitleType } from '@/types';

export const unAuthorizedResponse = (req: Request, res: Response) => {
    res.status(401).json({
        jsonrpc: "2.0",
        error: {
            code: 401,
            message: "Unauthorized",
        }
    });
}

export const MAKE_FULL_NAME_SHORTEN = (fullName: string) => {
    const nameParts = fullName.trim().split(/\s+/);

    if (nameParts.length === 1) {
        return fullName; // Return full name if there's only one part
    }

    const firstName = nameParts[0];
    let middleNameInitial = '';
    let lastName = '';

    if (nameParts.length === 2) {
        // If only two parts, assume it's "First Last"
        lastName = nameParts[1];
    } else {
        // Identify the position of the last name dynamically
        let lastNameIndex = 1; // Default: last name is the last word

        for (let i = nameParts.length - 2; i > 0; i--) {
            // If we detect a lowercase or very short word (≤3 letters), we assume it's part of the last name
            if (nameParts[i].length <= 3 || /^[a-z]/.test(nameParts[i])) {
                lastNameIndex = i;
            } else {
                break; // Stop when we find a non-compound part
            }
        }

        // Middle name initial (if any)
        if (lastNameIndex > 1) {
            middleNameInitial = nameParts[1].charAt(0).toUpperCase() + '.';
        }

        // Extract last name correctly
        lastName = nameParts.slice(lastNameIndex).join(" ")

        if (lastName.split(" ").length > 2)
            lastName = lastName.split(" ").slice(0, -1).join(" ")
    }

    return middleNameInitial
        ? `${firstName} ${middleNameInitial} ${lastName}`
        : `${firstName} ${lastName}`;
};



export const FORMAT_CURRENCY = (value: number) => {
    if (isNaN(value))
        return "$0.00";

    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(value);
}

export const getNextDay = (targetDay: WeeklyQueueTitleType): number => {
    switch (targetDay) {
        case "everySunday": return nextSunday(new Date().setHours(0, 1, 1, 1)).getTime()
        case "everyMonday": return nextMonday(new Date().setHours(0, 1, 1, 1)).getTime()
        case "everyTuesday": return nextTuesday(new Date().setHours(0, 1, 1, 1)).getTime()
        case "everyWednesday": return nextWednesday(new Date().setHours(0, 1, 1, 1)).getTime()
        case "everyThursday": return nextThursday(new Date().setHours(0, 1, 1, 1)).getTime()
        case "everyFriday": return nextFriday(new Date().setHours(0, 0, 0, 1)).getTime()
        case "everySaturday": return nextSaturday(new Date().setHours(0, 0, 0, 1)).getTime()
        default: return 0
    }
}


export const getSpecificDayOfMonth = (dayString: string): Date => {
    // Get the current date
    const today = new Date();

    // Mapping of day strings to the actual day of the month
    const dayMap: { [key: string]: number } = {
        'everyFirst': 1,
        'everySecond': 2,
        'everyThird': 3,
        'everyFourth': 4,
        'everyFifth': 5,
        'everySixth': 6,
        'everySeventh': 7,
        'everyEighth': 8,
        'everyNinth': 9,
        'everyTenth': 10,
        'everyEleventh': 11,
        'everyTwelfth': 12,
        'everyThirteenth': 13,
        'everyFourteenth': 14,
        'everyFifteenth': 15,
        'everySixteenth': 16,
        'everySeventeenth': 17,
        'everyEighteenth': 18,
        'everyNineteenth': 19,
        'everyTwentieth': 20,
        'everyTwentyFirst': 21,
        'everyTwentySecond': 22,
        'everyTwentyThird': 23,
        'everyTwentyFourth': 24,
        'everyTwentyFifth': 25,
        'everyTwentySixth': 26,
        'everyTwentySeventh': 27,
        'everyTwentyEighth': 28,
        'everyTwentyNinth': 29,
        'everyThirtieth': 30,
        'everyThirtyFirst': 31
    };

    // Check if the provided dayString exists in the map
    if (dayString in dayMap) {
        const targetDay = dayMap[dayString];
        // Get the current date

        // Clone the current date for modification
        let nextMonth = new Date();

        // If today is past the target day, move to the next month
        if (today.getDate() > targetDay) {
            // Set the date to the next month's target day
            nextMonth.setMonth(today.getMonth() + 1);
        }

        // Set the date to the target day
        nextMonth.setDate(targetDay);

        return nextMonth;
    } else {
        throw new Error('Invalid day string. Please provide a valid option.');
    }
}