class BookmarksManager {
  constructor() {
    this.selectedBookmarkId = null;
    this.expandedFolders = {};
    this.currentLevel = 0;
    this.currentIndex = 0;
    this.init();
  }

  // 渲染书签列表
  async renderBookmarks(bookmarks, parentElement, isSearchResult = false, level = 0) {
    const list = document.createElement("ul");
    list.classList.add("bookmark-ul");
    // 为每个 ul 元素添加唯一标识，方便后续查找
    if (parentElement.tagName === "LI") {
      list.dataset.parentId = parentElement.dataset.id;
    } else {
      list.dataset.parentId = "root"; // 或者其他的标识符，表示根节点
    }
    parentElement.appendChild(list);

    if (!isSearchResult) {
      // 如果是正常渲染，从 chrome.storage 中加载保存的展开状态
      this.expandedFolders = await this.loadExpandedFolders();
    }

    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark = bookmarks[i];
      const listItem = this.createBookmarkItem(bookmark, level, i);
      list.appendChild(listItem);

      // 递归渲染子节点
      if (bookmark.children && bookmark.children.length > 0) {
        this.renderBookmarks(bookmark.children, listItem, isSearchResult, level + 1);
      }
    }
  }

  // 创建书签项
  createBookmarkItem(bookmark, level, index) {
    const listItem = document.createElement("li");
    listItem.dataset.id = bookmark.id;
    listItem.dataset.level = level;
    listItem.dataset.index = index;
    listItem.classList.add("bookmark-li");

    // 根据层级设置缩进
    listItem.style.marginLeft = `${level * 20}px`;

    if (bookmark.url) {
      // 书签
      const favicon = document.createElement("div");
      favicon.classList.add("favicon");
      // 直接使用默认图标
      favicon.style.backgroundImage = `url(images/default.png)`;
      listItem.appendChild(favicon);

      const link = document.createElement("a");
      link.href = bookmark.url;
      link.textContent = bookmark.title;
      link.dataset.id = bookmark.id;
      link.target = "_blank"; // 新标签页打开
      link.style.flexGrow = "1"; // 占据剩余空间

      listItem.appendChild(link);

      // 选择按钮
      const selectIcon = document.createElement("img");
      selectIcon.src = "images/select-icon.png";
      selectIcon.classList.add("select-icon");
      selectIcon.alt = "选择";
      selectIcon.addEventListener("click", (event) => {
        event.stopPropagation(); // 阻止事件冒泡到 listItem
        this.updateSelection(bookmark.id);
      });
      listItem.appendChild(selectIcon);

      const editIcon = document.createElement("img");
      editIcon.src = "images/pencil.png";
      editIcon.classList.add("edit-icon");
      editIcon.alt = "编辑";
      editIcon.addEventListener("click", (event) => {
        event.stopPropagation();
        this.renameBookmark(bookmark.id);
      });
      listItem.appendChild(editIcon);
    } else {
      // 文件夹
      const folderIcon = document.createElement("img");
      folderIcon.classList.add("folder-icon");
      folderIcon.src = this.expandedFolders[bookmark.id]
        ? "images/folder-open.png"
        : "images/folder-closed.png";
      folderIcon.alt = this.expandedFolders[bookmark.id]
        ? "展开文件夹"
        : "关闭文件夹";
      listItem.appendChild(folderIcon);

      const folderTitle = document.createElement("span");
      folderTitle.textContent = bookmark.title;
      folderTitle.classList.add("folder-title");
      listItem.appendChild(folderTitle);

      const editIcon = document.createElement("img");
      editIcon.src = "images/pencil.png";
      editIcon.classList.add("edit-icon");
      editIcon.style.marginLeft = "auto"; // 使用 margin-left: auto; 靠右
      editIcon.alt = "编辑";
      editIcon.addEventListener("click", (event) => {
        event.stopPropagation();
        this.renameBookmark(bookmark.id, true);
      });
      listItem.appendChild(editIcon);

      listItem.classList.add("folder");
      if (this.expandedFolders[bookmark.id]) {
        listItem.classList.add("expanded");
      }

      folderIcon.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleFolder(bookmark.id);
      });

      folderTitle.addEventListener("click", (event) => {
        event.stopPropagation();
        this.toggleFolder(bookmark.id);
      });
    }
    // 添加点击事件
    listItem.addEventListener("click", (event) => {
      const target = event.target;
      if (target.tagName === "A") {
        return;
      }
      this.updateSelection(bookmark.id);
    });

    // 添加选中的样式
    if (bookmark.id === this.selectedBookmarkId) {
      listItem.classList.add("selected");
      this.currentLevel = level;
      this.currentIndex = index;
      // 自动展开父节点
      let current = listItem;
      while (
        current.parentElement &&
        current.parentElement.tagName === "UL" &&
        current.parentElement.parentElement.tagName === "LI"
      ) {
        const parent = current.parentElement.parentElement;
        if (!parent.classList.contains("expanded")) {
          parent.classList.add("expanded");
          parent.querySelector(".folder-icon").src = "images/folder-open.png";
          this.expandedFolders[parent.dataset.id] = true;
        }
        current = parent;
      }
    }

    return listItem;
  }

  // 重新渲染移动书签的目标父节点
  async renderMovedParent(parentId) {
    // 获取到移动后的父节点
    const [parent] = await new Promise((resolve) =>
      chrome.bookmarks.getSubTree(parentId, resolve)
    );
    // 找到页面中该父节点对应的 ul
    const parentUl = document.querySelector(`ul[data-parent-id="${parentId}"]`);
    if (!parentUl) return;
    parentUl.innerHTML = ""; // 清空该节点在页面中到内容
    // 重新渲染该节点
    for (let i = 0; i < parent.children.length; i++) {
      const bookmark = parent.children[i];
      const listItem = this.createBookmarkItem(bookmark, parseInt(parentUl.parentElement.dataset.level || "0") + 1, i);
      parentUl.appendChild(listItem);

      // 递归渲染子节点 (这里只需要处理文件夹即可, 因为只有文件夹才有子节点)
      if (bookmark.children && bookmark.children.length > 0) {
        await this.renderBookmarks(
          bookmark.children,
          listItem,
          false,
          parseInt(listItem.dataset.level) + 1
        );
      }
    }
  }

  // 重命名书签/文件夹 (修复 renameBookmark 函数中的错误)
  renameBookmark(bookmarkId, isFolder = false) {
    const bookmarkItem = document.querySelector(`li[data-id="${bookmarkId}"]`);
    // 如果找不到对应的书签项, 则直接返回
    if (!bookmarkItem) return;
    const target = isFolder
      ? bookmarkItem.querySelector(".folder-title")
      : bookmarkItem.querySelector("a");
    const originalTitle = target.textContent;

    const input = document.createElement("input");
    input.type = "text";
    input.value = originalTitle;
    input.classList.add("rename-input");
    bookmarkItem.replaceChild(input, target);
    input.focus();

    input.addEventListener("blur", () => {
      this.saveRename(bookmarkId, input, target, bookmarkItem, isFolder);
    });

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.saveRename(bookmarkId, input, target, bookmarkItem, isFolder);
      } else if (event.key === "Escape") {
        // 取消重命名
        target.textContent = originalTitle;
        bookmarkItem.replaceChild(target, input);
        if (isFolder) {
          const editIcon = bookmarkItem.querySelector(".edit-icon");
          bookmarkItem.appendChild(editIcon);
        }
      }
    });
  }

  // 保存重命名
  saveRename(bookmarkId, input, target, bookmarkItem, isFolder = false) {
    const newTitle = input.value.trim();
    if (newTitle) {
      chrome.bookmarks.update(bookmarkId, { title: newTitle }, () => {
        target.textContent = newTitle;
        target.dataset.id = bookmarkId;
        bookmarkItem.replaceChild(target, input);
        if (isFolder) {
          const editIcon = bookmarkItem.querySelector(".edit-icon");
          bookmarkItem.appendChild(editIcon);
        }
      });
    } else {
      // 标题为空，恢复原标题
      chrome.bookmarks.get(bookmarkId, (bookmarks) => {
        target.textContent = bookmarks[0].title;
        target.dataset.id = bookmarkId;
        bookmarkItem.replaceChild(target, input);
        if (isFolder) {
          const editIcon = bookmarkItem.querySelector(".edit-icon");
          bookmarkItem.appendChild(editIcon);
        }
      });
    }
  }

  // 更新选中状态
  updateSelection(bookmarkId) {
    // 移除之前选中的元素的 .selected 类
    const previouslySelectedItem = document.querySelector(".selected");
    if (previouslySelectedItem) {
      previouslySelectedItem.classList.remove("selected");
    }

    // 为新选中的元素添加 .selected 类
    const newlySelectedItem = document.querySelector(`li[data-id="${bookmarkId}"]`);
    if (newlySelectedItem) {
      newlySelectedItem.classList.add("selected");
      this.selectedBookmarkId = bookmarkId;
      this.currentLevel = parseInt(newlySelectedItem.dataset.level);
      this.currentIndex = parseInt(newlySelectedItem.dataset.index);
      newlySelectedItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  // 切换文件夹展开/折叠状态
  async toggleFolder(folderId) {
    const folderItem = document.querySelector(`li[data-id="${folderId}"]`);
    const folderIcon = folderItem.querySelector(".folder-icon");
    const isExpanded = folderItem.classList.contains("expanded");

    if (isExpanded) {
      folderItem.classList.remove("expanded");
      folderIcon.src = "images/folder-closed.png";
      folderIcon.alt = "关闭文件夹";
      this.expandedFolders[folderId] = false;
    } else {
      folderItem.classList.add("expanded");
      folderIcon.src = "images/folder-open.png";
      folderIcon.alt = "展开文件夹";
      this.expandedFolders[folderId] = true;
    }
    await this.saveExpandedFolders();
    this.updateSelection(folderId);
  }

  // 保存展开的文件夹
  async saveExpandedFolders() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ expandedFolders: this.expandedFolders }, resolve);
    });
  }

  // 加载展开的文件夹
  async loadExpandedFolders() {
    return new Promise((resolve) => {
      chrome.storage.local.get("expandedFolders", (result) => {
        resolve(result.expandedFolders || {});
      });
    });
  }

  // 搜索书签
  searchBookmarks(query) {
    chrome.bookmarks.search(query, (results) => {
      const bookmarkList = document.getElementById("bookmark-list");
      bookmarkList.innerHTML = ""; // 清空列表
      this.renderBookmarks(results, bookmarkList, true);
      if (this.selectedBookmarkId) {
        this.updateSelection(this.selectedBookmarkId);
      }
    });
  }

  // 监听键盘事件 (修改按键判断逻辑)
  handleKeyDown(event) {
    if (!this.selectedBookmarkId) {
      // 没有选中任何书签或文件夹时，默认选中第一个
      const firstItem = document.querySelector(`.bookmark-li`);
      if (firstItem) {
        this.updateSelection(firstItem.dataset.id);
      }
      return;
    }

    const selectedItem = document.querySelector(`.selected`);
    if (!selectedItem) return;
    const currentLevel = this.currentLevel;
    const currentIndex = this.currentIndex;

    // 将 W 和 S 的逻辑放在所有按键判断的最前面
    if (event.key === "w" || event.key === "W") {
      // W 向上移动书签
      event.preventDefault();
      event.stopPropagation(); // 阻止事件冒泡
      this.moveBookmark(this.selectedBookmarkId, "up");
      return; // 移动完书签后直接返回
    } else if (event.key === "s" || event.key === "S") {
      // S 向下移动书签
      event.preventDefault();
      event.stopPropagation();
      this.moveBookmark(this.selectedBookmarkId, "down");
      return; // 移动完书签后直接返回
    } else if (event.key === "ArrowUp") {
      // ArrowUp 向上选中标签
      event.preventDefault();
      const currentUl = selectedItem.parentElement;
      const prevSibling = selectedItem.previousElementSibling;

      if (prevSibling) {
        if (
          prevSibling.classList.contains("folder") &&
          prevSibling.classList.contains("expanded")
        ) {
          // 如果前一个元素是展开的文件夹，则选中其最后一个子元素
          const children = prevSibling.querySelectorAll(".bookmark-li");
          this.updateSelection(children[children.length - 1].dataset.id);
        } else {
          // 否则选中前一个兄弟元素
          this.updateSelection(prevSibling.dataset.id);
        }
      } else {
        // 如果当前元素是第一个元素，则选中父元素
        const parentLi = currentUl.parentElement;
        if (parentLi && parentLi.classList.contains("folder")) {
          this.updateSelection(parentLi.dataset.id);
        }
      }
    } else if (event.key === "ArrowDown") {
      // ArrowDown 向下选中标签
      event.preventDefault();
      if (
        selectedItem.classList.contains("folder") &&
        selectedItem.classList.contains("expanded")
      ) {
        // 如果当前选中的是展开的文件夹，则选中其第一个子元素
        const firstChild = selectedItem.querySelector(".bookmark-li");
        if (firstChild) {
          this.updateSelection(firstChild.dataset.id);
        }
      } else {
        // 否则选中下一个兄弟元素
        const nextSibling = selectedItem.nextElementSibling;
        if (nextSibling) {
          this.updateSelection(nextSibling.dataset.id);
        } else {
          // 如果没有下一个兄弟元素，则查找其父元素的下一个兄弟元素
          let parentLi = selectedItem.parentElement.parentElement;
          let nextParentSibling = parentLi
            ? parentLi.nextElementSibling
            : null;
          while (parentLi && !nextParentSibling) {
            parentLi = parentLi.parentElement.parentElement;
            nextParentSibling = parentLi
              ? parentLi.nextElementSibling
              : null;
          }
          if (nextParentSibling) {
            this.updateSelection(nextParentSibling.dataset.id);
          }
        }
      }
    } else if (event.key === "Delete") {
      // Delete 删除书签
      event.preventDefault();
      if (selectedItem.classList.contains("folder")) {
        if (confirm("确定要删除此文件夹及其所有内容吗？此操作无法恢复!")) {
          chrome.bookmarks.removeTree(this.selectedBookmarkId, () => {
            selectedItem.remove();
            this.selectedBookmarkId = null; // 清空选中状态
          });
        }
      } else {
        if (confirm("确定要删除此书签吗？此操作无法恢复!")) {
          chrome.bookmarks.remove(this.selectedBookmarkId, () => {
            selectedItem.remove();
            this.selectedBookmarkId = null; // 清空选中状态
          });
        }
      }
    } else if (event.key === "e") {
      // e 编辑书签
      event.preventDefault();
      this.renameBookmark(this.selectedBookmarkId);
    } else if (
      event.key === "Tab" ||
      event.key === "ArrowLeft" ||
      event.key === "ArrowRight"
    ) {
      // Tab 或左右箭头 展开/收缩文件夹
      event.preventDefault();
      if (selectedItem && selectedItem.classList.contains("folder")) {
        this.toggleFolder(this.selectedBookmarkId);
      } else if (selectedItem) {
        // 如果选中的是书签
        const parent = selectedItem.parentElement.closest(".folder");
        if (parent && parent.classList.contains("expanded")) {
          // 如果其父文件夹是展开状态，则折叠父文件夹
          this.toggleFolder(parent.dataset.id);
        }
      }
    } else if (event.ctrlKey && event.key === "Enter") {
      // Ctrl + Enter 打开选中的书签或文件夹中的第一个书签
      event.preventDefault();
      if (selectedItem.classList.contains("folder")) {
        // 文件夹
        const firstChild = selectedItem.querySelector(".bookmark-li a"); // 获取第一个子节点中的链接
        if (firstChild) {
          chrome.tabs.create({ url: firstChild.href });
        }
      } else {
        // 书签
        const link = selectedItem.querySelector("a");
        if (link) {
          chrome.tabs.create({ url: link.href });
        }
      }
    }
  }

  // 移动书签(修改后的版本)
  moveBookmark(bookmarkId, direction) {
    chrome.bookmarks.get(bookmarkId, ([bookmark]) => {
      const parentId = bookmark.parentId;
      const currentIndex = bookmark.index;
      const newIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      chrome.bookmarks.getSubTree(parentId, ([parent]) => {
        const siblings = parent.children;

        // 边界检查
        if (newIndex < 0 || newIndex >= siblings.length) return;

        // 移动书签
        chrome.bookmarks.move(bookmarkId, {
          parentId: parentId,
          index: newIndex,
        });
      });
    });
  }

  // 更新 data-index 属性
  updateIndices(parentId) {
    const parentUl = document.querySelector(`ul[data-parent-id="${parentId}"]`);
    if (!parentUl) return;

    const children = parentUl.querySelectorAll(".bookmark-li");
    for (let i = 0; i < children.length; i++) {
      children[i].dataset.index = i;
    }
  }

  // 检测系统主题
  checkDarkMode() {
    const savedDarkMode = localStorage.getItem("darkMode");
    if (savedDarkMode !== null) {
      document.body.classList.toggle("dark-mode", savedDarkMode === "true");
      return;
    }

    const prefersDarkMode = window.matchMedia(
      "(prefers-color-scheme: dark)"
    ).matches;
    if (prefersDarkMode) {
      document.body.classList.add("dark-mode"); // 添加暗黑模式类名
    } else {
      document.body.classList.remove("dark-mode");
    }
  }

  // 切换暗黑模式
  toggleDarkMode() {
    const isDarkMode = document.body.classList.contains("dark-mode");
    document.body.classList.toggle("dark-mode", !isDarkMode);
    localStorage.setItem("darkMode", !isDarkMode);
  }

  // 获取所有文件夹
  getFolders(callback) {
    chrome.bookmarks.getTree(function (tree) {
      const folders = [];
      function traverse(node) {
        if (node.children) {
          if (node.title) {
            folders.push(node);
          }
          node.children.forEach(traverse);
        }
      }
      traverse(tree[0]);
      callback(folders);
    });
  }

  // 显示添加书签的对话框
  showAddBookmarkDialog() {
    const dialog = document.getElementById("addBookmarkDialog");
    const folderSelect = document.getElementById("bookmarkFolder");

    // 清空并重新填充文件夹选项
    folderSelect.innerHTML = "";
    this.getFolders((folders) => {
      folders.forEach((folder) => {
        const option = document.createElement("option");
        option.value = folder.id;
        option.textContent = folder.title;
        folderSelect.appendChild(option);
      });
    });

    dialog.classList.add("show");
  }

  // 隐藏添加书签的对话框
  hideAddBookmarkDialog() {
    const dialog = document.getElementById("addBookmarkDialog");
    dialog.classList.remove("show");
  }

  // 处理添加书签的逻辑
  handleAddBookmark() {
    const title = document.getElementById("bookmarkTitle").value;
    const url = document.getElementById("bookmarkUrl").value;
    const parentId = document.getElementById("bookmarkFolder").value;

    chrome.bookmarks.create(
      {
        parentId: parentId,
        title: title,
        url: url,
      },
      () => {
        this.refreshBookmarkList();
        this.hideAddBookmarkDialog();
      }
    );
  }

  // 显示添加文件夹的对话框
  showAddFolderDialog() {
    const dialog = document.getElementById("addFolderDialog");
    const parentSelect = document.getElementById("parentFolder");

    // 清空并重新填充父文件夹选项
    parentSelect.innerHTML = "";
    this.getFolders((folders) => {
      folders.forEach((folder) => {
        const option = document.createElement("option");
        option.value = folder.id;
        option.textContent = folder.title;
        parentSelect.appendChild(option);
      });
    });

    dialog.classList.add("show");
  }

  // 隐藏添加文件夹的对话框
  hideAddFolderDialog() {
    const dialog = document.getElementById("addFolderDialog");
    dialog.classList.remove("show");
  }

  // 处理添加文件夹的逻辑
  handleAddFolder() {
    const title = document.getElementById("folderName").value;
    const parentId = document.getElementById("parentFolder").value;

    chrome.bookmarks.create(
      {
        parentId: parentId,
        title: title,
      },
      () => {
        this.refreshBookmarkList();
        this.hideAddFolderDialog();
      }
    );
  }

  // 显示编辑文件夹的对话框
  showEditFolderDialog(folder) {
    const dialog = document.getElementById("editFolderDialog");
    const nameInput = document.getElementById("editFolderName");
    const parentSelect = document.getElementById("editParentFolder");
    const folderIdInput = document.getElementById("editFolderId");

    // 设置当前文件夹的名称和 ID
    nameInput.value = folder.title;
    folderIdInput.value = folder.id;

    // 清空并重新填充父文件夹选项
    parentSelect.innerHTML = "";
    this.getFolders((folders) => {
      folders.forEach((f) => {
        if (f.id !== folder.id) {
          const option = document.createElement("option");
          option.value = f.id;
          option.textContent = f.title;
          // 如果当前文件夹的父文件夹是该选项，则设置为选中状态
          if (f.id === folder.parentId) {
            option.selected = true;
          }
          parentSelect.appendChild(option);
        }
      });
    });

    dialog.classList.add("show");
  }

  // 隐藏编辑文件夹的对话框
  hideEditFolderDialog() {
    const dialog = document.getElementById("editFolderDialog");
    dialog.classList.remove("show");
  }

  // 处理编辑文件夹的逻辑
  handleEditFolder() {
    const folderId = document.getElementById("editFolderId").value;
    const newTitle = document.getElementById("editFolderName").value;
    const newParentId = document.getElementById("editParentFolder").value;

    // 更新文件夹的标题
    chrome.bookmarks.update(folderId, { title: newTitle }, () => {
      // 如果父文件夹发生变化，则移动文件夹
      chrome.bookmarks.get(folderId, (folders) => {
        if (folders[0].parentId !== newParentId) {
          chrome.bookmarks.move(folderId, { parentId: newParentId }, () => {
            this.refreshBookmarkList();
          });
        } else {
          this.refreshBookmarkList();
        }
        this.hideEditFolderDialog();
      });
    });
  }

  // 刷新书签列表
  refreshBookmarkList() {
    const bookmarkList = document.getElementById("bookmark-list");
    bookmarkList.innerHTML = ""; // 清空列表
    chrome.bookmarks.getTree((bookmarkTree) => {
      this.renderBookmarks(bookmarkTree[0].children, bookmarkList);
      if (this.selectedBookmarkId) {
        this.updateSelection(this.selectedBookmarkId);
      }
    });
  }

  // 初始化
  init() {
    this.refreshBookmarkList();
    // 监听搜索框输入
    let debounceTimer;
    const searchInput = document.getElementById("search-input");
    searchInput.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const query = searchInput.value.trim();
        if (query) {
          this.searchBookmarks(query);
        } else {
          // 查询为空，重新渲染完整书签树
          this.refreshBookmarkList();
        }
      }, 300); // 300ms 防抖
    });

    // 监听键盘事件
    document.addEventListener("keydown", this.handleKeyDown.bind(this));

    // 监听书签移动事件
    chrome.bookmarks.onMoved.addListener((id, moveInfo) => {
      // 移动事件触发时, 书签的实际位置已经改变了, 但是 DOM 还没有更新.
      // 所以这里我们需要重新渲染移动后的父节点
      this.renderMovedParent(moveInfo.parentId);
    });

    // 监听系统主题变化
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", this.checkDarkMode);

    // 初始检测
    this.checkDarkMode();

    // 添加工具栏按钮的事件监听器
    document
      .getElementById("darkModeToggle")
      .addEventListener("click", this.toggleDarkMode.bind(this));
    document
      .getElementById("refreshButton")
      .addEventListener("click", this.refreshBookmarkList.bind(this));
    document
      .getElementById("addBookmark")
      .addEventListener("click", this.showAddBookmarkDialog.bind(this));
    document
      .getElementById("addFolder")
      .addEventListener("click", this.showAddFolderDialog.bind(this));

    // 添加对话框按钮的事件监听器
    document
      .getElementById("saveBookmark")
      .addEventListener("click", this.handleAddBookmark.bind(this));
    document
      .getElementById("cancelBookmark")
      .addEventListener("click", this.hideAddBookmarkDialog.bind(this));
    document
      .getElementById("saveFolder")
      .addEventListener("click", this.handleAddFolder.bind(this));
    document
      .getElementById("cancelFolder")
      .addEventListener("click", this.hideAddFolderDialog.bind(this));
    document
      .getElementById("saveEditFolder")
      .addEventListener("click", this.handleEditFolder.bind(this));
    document
      .getElementById("cancelEditFolder")
      .addEventListener("click", this.hideEditFolderDialog.bind(this));
  }
}

// 初始化
document.addEventListener("DOMContentLoaded", () => {
  new BookmarksManager();
});