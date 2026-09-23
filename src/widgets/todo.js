const TODO_STORAGE_KEY = 'sidebar-todo-list';
const TODO_UPDATED_KEY = 'sidebar-todo-list-updated';

// localStorage is the fast working copy; chrome.storage keeps a backup. The sync
// area follows the Chrome profile, so todos survive a reinstall when Chrome sync is on.
const hasChromeStorage = typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync;

function getTodos() {
    return JSON.parse(localStorage.getItem(TODO_STORAGE_KEY)) || [];
}

function localUpdatedAt() {
    return Number(localStorage.getItem(TODO_UPDATED_KEY)) || 0;
}

function backupTodos(todos, updatedAt) {
    if (!hasChromeStorage) return;
    const todoBackup = { todos, updatedAt };
    chrome.storage.local.set({ todoBackup });
    // Sync caps a single item at 8KB; the local copy still holds very long lists
    chrome.storage.sync.set({ todoBackup }).catch((err) => {
        console.warn('Todo list too large to sync; kept in local backup only.', err);
    });
}

function saveTodos(todos) {
    const updatedAt = Date.now();
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todos));
    localStorage.setItem(TODO_UPDATED_KEY, String(updatedAt));
    backupTodos(todos, updatedAt);
}

// Take a backup copy if it's newer than what this page has (another tab or
// device changed it, or local data was cleared)
function adoptIfNewer(todoBackup) {
    if (!todoBackup || !Array.isArray(todoBackup.todos)) return false;
    const localEmpty = getTodos().length === 0 && !localStorage.getItem(TODO_UPDATED_KEY);
    if (todoBackup.updatedAt <= localUpdatedAt() && !localEmpty) return false;
    localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(todoBackup.todos));
    localStorage.setItem(TODO_UPDATED_KEY, String(todoBackup.updatedAt || Date.now()));
    return true;
}

export function renderTodo() {
    const widgetWrapper = document.createElement('div');
    widgetWrapper.className = 'todo-widget';

    const title = document.createElement('h3');
    title.textContent = 'Todo List';

    const todoList = document.createElement('ul');
    todoList.className = 'todo-list';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add a new todo...';
    input.className = 'todo-input';

    let draggedIndex = null;
    let draggedElement = null;
    let placeholder = null;
    let offsetY = 0;
    let itemHeight = 0;

    const renderItems = () => {
        const todos = getTodos();
        todoList.innerHTML = '';
        todos.forEach((todo, index) => {
            const li = document.createElement('li');
            const label = document.createElement('label');
            label.className = 'checkbox-label';

            li.className = todo.completed ? 'completed' : '';
            li.dataset.index = index;

            let startX = 0;
            let startY = 0;
            let isDragging = false;
            const DRAG_THRESHOLD = 5;

            // Mouse events for constrained vertical dragging
            li.addEventListener('mousedown', (e) => {
                // Allow delete button clicks to pass through
                if (e.target.tagName === 'BUTTON') return;
                
                e.preventDefault();
                startX = e.clientX;
                startY = e.clientY;
                isDragging = false;
                draggedIndex = index;
                draggedElement = li;
                
                const rect = li.getBoundingClientRect();
                offsetY = e.clientY - rect.top;
                itemHeight = rect.height;

                const onMouseMoveStart = (moveEvent) => {
                    const dx = Math.abs(moveEvent.clientX - startX);
                    const dy = Math.abs(moveEvent.clientY - startY);
                    
                    if (!isDragging && dy > DRAG_THRESHOLD) {
                        isDragging = true;
                        
                        // Lock the list height to prevent expansion during drag
                        const listRect = todoList.getBoundingClientRect();
                        todoList.style.height = listRect.height + 'px';
                        
                        // Create placeholder with matching styles
                        placeholder = document.createElement('li');
                        placeholder.className = 'drag-placeholder';
                        placeholder.style.height = rect.height + 'px';
                        placeholder.style.boxSizing = 'border-box';
                        
                        // Style the dragged element
                        todoList.style.position = 'relative';
                        li.style.position = 'absolute';
                        li.style.top = (rect.top - listRect.top) + 'px';
                        li.style.left = '0';
                        li.style.right = '0';
                        li.style.boxSizing = 'border-box';
                        li.style.zIndex = '1000';
                        li.classList.add('dragging');
                        
                        // Insert placeholder where the element was
                        todoList.insertBefore(placeholder, li);

                        // Set grabbing cursor on body during drag
                        document.body.classList.add('todo-dragging');
                    }
                    
                    if (isDragging) {
                        onMouseMove(moveEvent);
                    }
                };

                const onMouseUpStart = (upEvent) => {
                    document.removeEventListener('mousemove', onMouseMoveStart);
                    document.removeEventListener('mouseup', onMouseUpStart);
                    
                    if (!isDragging) {
                        // It was a click, toggle completed state
                        const todos = getTodos();
                        todos[index].completed = !todos[index].completed;
                        saveTodos(todos);
                        renderItems();
                    } else {
                        onMouseUp();
                    }
                    
                    draggedElement = null;
                    draggedIndex = null;
                };

                document.addEventListener('mousemove', onMouseMoveStart);
                document.addEventListener('mouseup', onMouseUpStart);
            });

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.checked = todo.completed;
            checkbox.addEventListener('change', () => {
                todos[index].completed = checkbox.checked;
                saveTodos(todos);
                renderItems();
            });

            const customCheckbox = document.createElement('span');
            customCheckbox.className = 'custom-checkbox';

            const text = document.createElement('span');
            text.className = 'todo-text';
            text.textContent = todo.text;

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '×';
            deleteBtn.addEventListener('click', () => {
                todos.splice(index, 1);
                saveTodos(todos);
                renderItems();
            });

            label.appendChild(checkbox);
            label.appendChild(customCheckbox);
            label.appendChild(text);

            li.appendChild(label);
            li.appendChild(deleteBtn);
            todoList.appendChild(li);
        });
    };

    const onMouseMove = (e) => {
        if (!draggedElement || !placeholder) return;

        // Get current list bounds (recalculate as list may have changed)
        const listRect = todoList.getBoundingClientRect();
        const minY = 0;
        const maxY = listRect.height - itemHeight;

        // Move the dragged element vertically only, clamped to list bounds
        let newY = e.clientY - offsetY - listRect.top;
        const clampedY = Math.max(minY, Math.min(maxY, newY));
        draggedElement.style.top = clampedY + 'px';

        // Find where to move the placeholder
        const allItems = Array.from(todoList.querySelectorAll('li:not(.dragging)'));
        const draggedTop = clampedY + listRect.top;

        // Remove placeholder from consideration for positioning
        const otherItems = allItems.filter(item => item !== placeholder);
        
        if (otherItems.length === 0) return;

        // Check if we're hitting the top bound (user is trying to drag above)
        const firstItem = otherItems[0];
        const firstRect = firstItem.getBoundingClientRect();
        if (newY <= minY || draggedTop <= firstRect.top + 5) {
            if (todoList.firstChild !== placeholder) {
                todoList.insertBefore(placeholder, todoList.firstChild);
            }
            return;
        }

        // Check if we're hitting the bottom bound (user is trying to drag below)
        const lastItem = otherItems[otherItems.length - 1];
        const lastRect = lastItem.getBoundingClientRect();
        if (newY >= maxY || draggedTop + itemHeight >= lastRect.bottom - 5) {
            if (placeholder.nextSibling !== null) {
                todoList.appendChild(placeholder);
            }
            return;
        }

        // Find insertion point in the middle
        let insertBefore = null;
        for (const item of otherItems) {
            const rect = item.getBoundingClientRect();
            const threshold = rect.top + rect.height * 0.5;
            
            if (draggedTop + itemHeight * 0.5 < threshold) {
                insertBefore = item;
                break;
            }
        }

        // Move placeholder to new position
        if (insertBefore) {
            if (placeholder.nextSibling !== insertBefore) {
                todoList.insertBefore(placeholder, insertBefore);
            }
        } else {
            if (placeholder.nextSibling !== null) {
                todoList.appendChild(placeholder);
            }
        }
    };

    const onMouseUp = () => {
        if (!draggedElement || !placeholder) return;

        // Calculate new index based on placeholder position
        const children = Array.from(todoList.children);
        const newIndex = children.filter(c => c !== draggedElement).indexOf(placeholder);

        // Reorder todos if position changed
        if (newIndex !== -1 && newIndex !== draggedIndex) {
            const todos = getTodos();
            const [draggedItem] = todos.splice(draggedIndex, 1);
            todos.splice(newIndex, 0, draggedItem);
            saveTodos(todos);
        }

        // Cleanup
        document.body.classList.remove('todo-dragging');
        todoList.style.height = '';
        todoList.style.position = '';
        draggedElement.classList.remove('dragging');
        draggedElement.style.position = '';
        draggedElement.style.top = '';
        draggedElement.style.left = '';
        draggedElement.style.right = '';
        
        draggedElement.style.boxSizing = '';
        draggedElement.style.zIndex = '';
        placeholder.remove();
        placeholder = null;

        renderItems();
    };

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && input.value.trim() !== '') {
            const todos = getTodos();
            todos.push({ text: input.value.trim(), completed: false });
            saveTodos(todos);
            input.value = '';
            renderItems();
        }
    });

    widgetWrapper.appendChild(title);
    widgetWrapper.appendChild(todoList);
    widgetWrapper.appendChild(input);

    renderItems();

    if (hasChromeStorage) {
        Promise.all([chrome.storage.sync.get('todoBackup'), chrome.storage.local.get('todoBackup')])
            .then(([synced, local]) => {
                const newest = [synced.todoBackup, local.todoBackup]
                    .filter(Boolean)
                    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
                if (adoptIfNewer(newest)) {
                    renderItems();
                } else if (!newest ? getTodos().length > 0 : newest.updatedAt < localUpdatedAt()) {
                    // First run with existing todos, or the backup is behind: back up now
                    backupTodos(getTodos(), localUpdatedAt() || Date.now());
                }
            });
        chrome.storage.onChanged.addListener((changes) => {
            if (!changes.todoBackup || draggedElement) return;
            if (adoptIfNewer(changes.todoBackup.newValue)) renderItems();
        });
    }

    return widgetWrapper;
}