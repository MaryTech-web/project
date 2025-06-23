document.addEventListener('DOMContentLoaded', () => {
    // Get references to DOM elements
    const taskInput = document.getElementById('taskInput');
    const taskDateInput = document.getElementById('taskDate');
    const taskTimeInput = document.getElementById('taskTime');
    const addTaskButton = document.getElementById('addTaskButton');
    const taskList = document.getElementById('taskList');
    const clearCompletedButton = document.getElementById('clearCompletedButton');

    let audio; // Declare audio variable globally or in scope

    // --- Alarm Related Variables ---
    const ALARM_CHECK_INTERVAL = 1000 * 5; // Check every 5 seconds (adjust as needed)
    let alarmCheckIntervalId; // To store the interval ID for clearing
    const triggeredAlarms = new Set(); // To prevent re-triggering the same alarm

    // Load tasks from local storage when the page loads
    loadTasks();

    // Start the alarm checker
    startAlarmChecker();

    // Request Notification permission (good practice to do early)
    if ('Notification' in window) {
        Notification.requestPermission();
    }

    // Event listener for adding a new task
    addTaskButton.addEventListener('click', addTask);
    taskInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter') {
            addTask();
        }
    });

    // Event listener for managing clicks on the task list (delegation)
    taskList.addEventListener('click', manageTask);

    // Event listener for clearing completed tasks
    clearCompletedButton.addEventListener('click', clearCompletedTasks);

    /**
     * Adds a new task to the list.
     */
    function addTask() {
        const taskText = taskInput.value.trim();
        const taskDate = taskDateInput.value;
        const taskTime = taskTimeInput.value;

        if (taskText === '') {
            alert('Please enter a task!');
            return;
        }

        // Create the task item with date and time
        // The unique ID will be crucial for managing alarms and preventing duplicates
        const taskId = `task-${Date.now()}`; // Simple unique ID
        createTaskElement(taskText, taskDate, taskTime, false, taskId);
        saveTasks(); // Save tasks to local storage
        taskInput.value = '';
        taskDateInput.value = '';
        taskTimeInput.value = '';
    }

    /**
     * Creates and appends a new task list item to the DOM.
     * @param {string} text - The text content of the task.
     * @param {string} date - The date string (e.g., 'YYYY-MM-DD').
     * @param {string} time - The time string (e.g., 'HH:MM').
     * @param {boolean} isCompleted - Whether the task is completed or not.
     * @param {string} id - A unique ID for the task (new parameter).
     */
    function createTaskElement(text, date, time, isCompleted, id) {
        const listItem = document.createElement('li');
        listItem.dataset.taskId = id; // Store the unique ID as a data attribute
        listItem.dataset.taskDate = date; // Store original date
        listItem.dataset.taskTime = time; // Store original time

        if (isCompleted) {
            listItem.classList.add('completed');
        }

        // Task Text Span
        const taskTextSpan = document.createElement('span');
        taskTextSpan.classList.add('task-text');
        taskTextSpan.textContent = text;
        listItem.appendChild(taskTextSpan);

        // Task Meta (Date, Time, Delete Button) container
        const taskMeta = document.createElement('div');
        taskMeta.classList.add('task-meta');
        listItem.appendChild(taskMeta);

        // Date and Time Span
        const dateTimeSpan = document.createElement('span');
        dateTimeSpan.classList.add('task-datetime');
        let displayDateTime = '';
        if (date) {
            try {
                const dateObj = new Date(date + 'T00:00:00');
                displayDateTime += dateObj.toLocaleDateString('en-US', {
                    weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
                });
            } catch (e) {
                displayDateTime += date;
            }
        }
        if (time) {
            if (displayDateTime) displayDateTime += ' at ';
            try {
                const timeObj = new Date(`2000-01-01T${time}`);
                displayDateTime += timeObj.toLocaleTimeString('en-US', {
                    hour: 'numeric', minute: 'numeric', hour12: true
                });
            } catch (e) {
                displayDateTime += time;
            }
        }
        dateTimeSpan.textContent = displayDateTime;
        taskMeta.appendChild(dateTimeSpan);

        // Delete Button
        const deleteButton = document.createElement('button');
        deleteButton.classList.add('delete-button');
        deleteButton.textContent = 'Delete';
        taskMeta.appendChild(deleteButton);

        taskList.appendChild(listItem);
    }

    /**
     * Handles clicks on task items (toggling completion or deleting).
     */
    function manageTask(event) {
        const clickedElement = event.target;
        const listItem = clickedElement.closest('li');

        if (!listItem) {
            return;
        }

        if (clickedElement.classList.contains('task-text')) {
            listItem.classList.toggle('completed');
            saveTasks();
            // If a completed task is un-completed, remove it from triggeredAlarms
            if (!listItem.classList.contains('completed')) {
                triggeredAlarms.delete(listItem.dataset.taskId);
            }
        } else if (clickedElement.classList.contains('delete-button')) {
            const taskId = listItem.dataset.taskId;
            listItem.remove();
            saveTasks();
            // Remove from triggered alarms if deleted
            triggeredAlarms.delete(taskId);
        }
    }

    /**
     * Clears all tasks that are marked as completed.
     */
    function clearCompletedTasks() {
        const completedTasks = taskList.querySelectorAll('.completed');
        completedTasks.forEach(task => {
            const taskId = task.dataset.taskId;
            task.remove();
            triggeredAlarms.delete(taskId); // Remove from triggered alarms if cleared
        });
        saveTasks();
    }

    /**
     * Saves the current tasks to Local Storage.
     * Each task is stored as an object { id: 'uniqueId', text: 'Task Text', date: 'YYYY-MM-DD', time: 'HH:MM', completed: true/false }.
     */
    function saveTasks() {
        const tasks = [];
        taskList.querySelectorAll('li').forEach(listItem => {
            const id = listItem.dataset.taskId; // Get the unique ID
            const text = listItem.querySelector('.task-text').textContent;
            const date = listItem.dataset.taskDate || ''; // Use data attributes for original values
            const time = listItem.dataset.taskTime || '';
            const completed = listItem.classList.contains('completed');
            tasks.push({ id: id, text: text, date: date, time: time, completed: completed });
        });
        localStorage.setItem('tasks', JSON.stringify(tasks));
    }

    /**
     * Loads tasks from Local Storage and renders them on the page.
     */
    function loadTasks() {
        const tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
        tasks.forEach(task => {
            createTaskElement(task.text, task.date, task.time, task.completed, task.id);
        });
    }

    // --- Alarm Logic ---

    /**
     * Starts the interval to check for overdue tasks.
     */
    function startAlarmChecker() {
        // Clear any existing interval to prevent duplicates if called multiple times
        if (alarmCheckIntervalId) {
            clearInterval(alarmCheckIntervalId);
        }
        alarmCheckIntervalId = setInterval(checkAlarms, ALARM_CHECK_INTERVAL);
    }

    /**
     * Checks all uncompleted tasks to see if their due time has passed.
     */
    function checkAlarms() {
        const now = new Date(); // Current time

        taskList.querySelectorAll('li:not(.completed)').forEach(listItem => {
            const taskId = listItem.dataset.taskId;
            const taskDate = listItem.dataset.taskDate;
            const taskTime = listItem.dataset.taskTime;
            const taskText = listItem.querySelector('.task-text').textContent;

            // Only check if date and time are set for the task
            if (taskDate && taskTime) {
                // Combine date and time into a comparable Date object
                const dueDateTime = new Date(`${taskDate}T${taskTime}:00`); // :00 for seconds (optional)

                // Check if the task is due and hasn't been triggered yet
                if (now >= dueDateTime && !triggeredAlarms.has(taskId)) {
                    triggerAlarm(taskId, taskText);
                }
            }
        });
    }

    /**
     * Triggers an alarm (plays sound, shows notification).
     * @param {string} taskId - The unique ID of the task.
     * @param {string} taskText - The text of the task.
     */
    function triggerAlarm(taskId, taskText) {
        // Add to triggered alarms set to prevent repeated triggers
        triggeredAlarms.add(taskId);

        // 1. Play sound (optional)
        if (!audio) {
            audio = new Audio('path/to/your/alarm-sound.mp3'); // REPLACE WITH YOUR SOUND FILE PATH
            audio.loop = false; // Play once or set to true for continuous
        }
        audio.play().catch(e => console.error("Error playing sound:", e));

        // 2. Show browser notification
        if ('Notification' in window && Notification.permission === 'granted') {
            const notificationOptions = {
                body: `Your task "${taskText}" is due!`,
                icon: 'path/to/your/icon.png' // Optional: path to an icon for the notification
            };
            new Notification('To-Do List Reminder', notificationOptions);
        } else if ('Notification' in window && Notification.permission === 'default') {
            // If permission wasn't granted yet, prompt again on alarm (less ideal UX)
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    new Notification('To-Do List Reminder', { body: `Your task "${taskText}" is due!` });
                }
            });
        } else {
            // Fallback for browsers without Notification API or permission denied
            alert(`ALARM! Your task "${taskText}" is due!`);
        }

        // Optional: Highlight the task in the list, or add a blinking effect
        const listItem = document.querySelector(`li[data-task-id="${taskId}"]`);
        if (listItem && !listItem.classList.contains('completed')) {
            listItem.style.animation = 'blink 1s infinite'; // Add CSS for this animation
            // After some time, remove the animation or automatically mark as completed
            // setTimeout(() => {
            //     listItem.style.animation = '';
            // }, 10000); // Stop blinking after 10 seconds
        }
    }
});
