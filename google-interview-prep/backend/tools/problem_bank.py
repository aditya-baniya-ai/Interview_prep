"""
Problem Bank — DSA problems fetched from Firestore.
Falls back to the hardcoded list if Firestore is not configured.
"""

import os
import random
import logging
from typing import Optional

logger = logging.getLogger(__name__)

_cache: list[dict] = []


def _load_from_firestore() -> list[dict]:
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore as fs

        service_account_path = os.getenv("FIREBASE_SERVICE_ACCOUNT_PATH", "")
        project_id = os.getenv("FIREBASE_PROJECT_ID", "")

        if not firebase_admin._apps:
            if service_account_path and os.path.exists(service_account_path):
                cred = credentials.Certificate(service_account_path)
                firebase_admin.initialize_app(
                    cred,
                    {"projectId": project_id} if project_id else None,
                )
            elif project_id:
                # Cloud Run / GCP: use Application Default Credentials
                firebase_admin.initialize_app(options={"projectId": project_id})
            else:
                # No creds and no project id — skip Firestore, fall back to local bank
                return []

        db = fs.client()
        docs = db.collection("problems").stream()
        problems = [doc.to_dict() for doc in docs]
        logger.info(f"Loaded {len(problems)} problems from Firestore.")
        return problems
    except Exception as e:
        logger.warning(f"Firestore unavailable, falling back to local bank: {e}")
        return []


def _get_problems() -> list[dict]:
    global _cache
    if not _cache:
        _cache = _load_from_firestore() or PROBLEMS
    return _cache

PROBLEMS = [
    {
        "id": "two-sum",
        "title": "Two Sum",
        "difficulty": "Easy",
        "tags": ["Arrays", "Hash Map"],
        "description": "Given an array of integers `nums` and an integer `target`, return the indices of the two numbers such that they add up to `target`.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice.\n\nYou can return the answer in any order.",
        "examples": [
            {"input": "nums = [2,7,11,15], target = 9", "output": "[0,1]", "explanation": "Because nums[0] + nums[1] == 9, we return [0, 1]."},
            {"input": "nums = [3,2,4], target = 6", "output": "[1,2]"},
            {"input": "nums = [3,3], target = 6", "output": "[0,1]"},
        ],
        "constraints": ["2 <= nums.length <= 10^4", "-10^9 <= nums[i] <= 10^9", "-10^9 <= target <= 10^9", "Only one valid answer exists."],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "4\n2 7 11 15\n9", "expected_output": "0 1"},
            {"input": "3\n3 2 4\n6", "expected_output": "1 2"},
            {"input": "2\n3 3\n6", "expected_output": "0 1"},
            {"input": "5\n1 5 3 7 2\n9", "expected_output": "1 3"},
            {"input": "4\n-1 -2 -3 -4\n-6", "expected_output": "1 3"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "valid-parentheses",
        "title": "Valid Parentheses",
        "difficulty": "Easy",
        "tags": ["Stack", "Strings"],
        "description": "Given a string `s` containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid.\n\nAn input string is valid if:\n1. Open brackets must be closed by the same type of brackets.\n2. Open brackets must be closed in the correct order.\n3. Every close bracket has a corresponding open bracket of the same type.",
        "examples": [
            {"input": 's = "()"', "output": "true"},
            {"input": 's = "()[]{}"', "output": "true"},
            {"input": 's = "(]"', "output": "false"},
        ],
        "constraints": ["1 <= s.length <= 10^4", "s consists of parentheses only '()[]{}'"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "()", "expected_output": "true"},
            {"input": "()[]{}", "expected_output": "true"},
            {"input": "(]", "expected_output": "false"},
            {"input": "([)]", "expected_output": "false"},
            {"input": "{[]}", "expected_output": "true"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "max-subarray",
        "title": "Maximum Subarray",
        "difficulty": "Medium",
        "tags": ["Arrays", "Dynamic Programming", "Kadane's Algorithm"],
        "description": "Given an integer array `nums`, find the subarray with the largest sum, and return its sum.\n\nA subarray is a contiguous non-empty sequence of elements within an array.",
        "examples": [
            {"input": "nums = [-2,1,-3,4,-1,2,1,-5,4]", "output": "6", "explanation": "The subarray [4,-1,2,1] has the largest sum 6."},
            {"input": "nums = [1]", "output": "1"},
            {"input": "nums = [5,4,-1,7,8]", "output": "23"},
        ],
        "constraints": ["1 <= nums.length <= 10^5", "-10^4 <= nums[i] <= 10^4"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "9\n-2 1 -3 4 -1 2 1 -5 4", "expected_output": "6"},
            {"input": "1\n1", "expected_output": "1"},
            {"input": "5\n5 4 -1 7 8", "expected_output": "23"},
            {"input": "3\n-1 -2 -3", "expected_output": "-1"},
            {"input": "6\n-2 -1 -3 -4 -1 -2", "expected_output": "-1"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "merge-intervals",
        "title": "Merge Intervals",
        "difficulty": "Medium",
        "tags": ["Arrays", "Sorting"],
        "description": "Given an array of `intervals` where `intervals[i] = [start_i, end_i]`, merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.",
        "examples": [
            {"input": "intervals = [[1,3],[2,6],[8,10],[15,18]]", "output": "[[1,6],[8,10],[15,18]]", "explanation": "Since intervals [1,3] and [2,6] overlap, merge them into [1,6]."},
            {"input": "intervals = [[1,4],[4,5]]", "output": "[[1,5]]", "explanation": "Intervals [1,4] and [4,5] are considered overlapping."},
        ],
        "constraints": ["1 <= intervals.length <= 10^4", "intervals[i].length == 2", "0 <= start_i <= end_i <= 10^4"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "4\n1 3\n2 6\n8 10\n15 18", "expected_output": "1 6\n8 10\n15 18"},
            {"input": "2\n1 4\n4 5", "expected_output": "1 5"},
            {"input": "1\n1 1", "expected_output": "1 1"},
            {"input": "3\n1 4\n0 4\n3 5", "expected_output": "0 5"},
        ],
        "optimalTimeComplexity": "O(n log n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "binary-tree-level-order",
        "title": "Binary Tree Level Order Traversal",
        "difficulty": "Medium",
        "tags": ["Trees", "BFS", "Queue"],
        "description": "Given the `root` of a binary tree, return the level order traversal of its nodes' values. (i.e., from left to right, level by level).",
        "examples": [
            {"input": "root = [3,9,20,null,null,15,7]", "output": "[[3],[9,20],[15,7]]"},
            {"input": "root = [1]", "output": "[[1]]"},
            {"input": "root = []", "output": "[]"},
        ],
        "constraints": ["The number of nodes in the tree is in range [0, 2000]", "-1000 <= Node.val <= 1000"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "3 9 20 null null 15 7", "expected_output": "[[3],[9,20],[15,7]]"},
            {"input": "1", "expected_output": "[[1]]"},
            {"input": "", "expected_output": "[]"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "number-of-islands",
        "title": "Number of Islands",
        "difficulty": "Medium",
        "tags": ["Graphs", "DFS", "BFS", "Matrix"],
        "description": "Given an `m x n` 2D binary grid which represents a map of '1's (land) and '0's (water), return the number of islands.\n\nAn island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically. You may assume all four edges of the grid are all surrounded by water.",
        "examples": [
            {"input": 'grid = [["1","1","1","1","0"],["1","1","0","1","0"],["1","1","0","0","0"],["0","0","0","0","0"]]', "output": "1"},
            {"input": 'grid = [["1","1","0","0","0"],["1","1","0","0","0"],["0","0","1","0","0"],["0","0","0","1","1"]]', "output": "3"},
        ],
        "constraints": ["m == grid.length", "n == grid[i].length", "1 <= m, n <= 300", "grid[i][j] is '0' or '1'."],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "4 5\n1 1 1 1 0\n1 1 0 1 0\n1 1 0 0 0\n0 0 0 0 0", "expected_output": "1"},
            {"input": "4 5\n1 1 0 0 0\n1 1 0 0 0\n0 0 1 0 0\n0 0 0 1 1", "expected_output": "3"},
        ],
        "optimalTimeComplexity": "O(m*n)",
        "optimalSpaceComplexity": "O(m*n)",
    },
    {
        "id": "lru-cache",
        "title": "LRU Cache",
        "difficulty": "Medium",
        "tags": ["Hash Map", "Linked List", "Design"],
        "description": "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache.\n\nImplement the `LRUCache` class:\n- `LRUCache(int capacity)` Initialize the LRU cache with positive size capacity.\n- `int get(int key)` Return the value of the key if the key exists, otherwise return -1.\n- `void put(int key, int value)` Update the value if the key exists. Otherwise, add the key-value pair. If the number of keys exceeds the capacity, evict the least recently used key.",
        "examples": [
            {"input": '["LRUCache","put","put","get","put","get","put","get","get","get"]\n[[2],[1,1],[2,2],[1],[3,3],[2],[4,4],[1],[3],[4]]', "output": "[null,null,null,1,null,-1,null,-1,3,4]"},
        ],
        "constraints": ["1 <= capacity <= 3000", "0 <= key <= 10^4", "0 <= value <= 10^5", "At most 2 * 10^5 calls will be made to get and put."],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "LRUCache 2\nput 1 1\nput 2 2\nget 1\nput 3 3\nget 2\nput 4 4\nget 1\nget 3\nget 4", "expected_output": "1\n-1\n-1\n3\n4"},
        ],
        "optimalTimeComplexity": "O(1)",
        "optimalSpaceComplexity": "O(capacity)",
    },
    {
        "id": "climbing-stairs",
        "title": "Climbing Stairs",
        "difficulty": "Easy",
        "tags": ["Dynamic Programming", "Math"],
        "description": "You are climbing a staircase. It takes `n` steps to reach the top.\n\nEach time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?",
        "examples": [
            {"input": "n = 2", "output": "2", "explanation": "There are two ways: 1+1 and 2."},
            {"input": "n = 3", "output": "3", "explanation": "There are three ways: 1+1+1, 1+2, and 2+1."},
        ],
        "constraints": ["1 <= n <= 45"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "2", "expected_output": "2"},
            {"input": "3", "expected_output": "3"},
            {"input": "5", "expected_output": "8"},
            {"input": "10", "expected_output": "89"},
            {"input": "1", "expected_output": "1"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "longest-substring-no-repeat",
        "title": "Longest Substring Without Repeating Characters",
        "difficulty": "Medium",
        "tags": ["Strings", "Sliding Window", "Hash Map"],
        "description": "Given a string `s`, find the length of the longest substring without repeating characters.",
        "examples": [
            {"input": 's = "abcabcbb"', "output": "3", "explanation": 'The answer is "abc", with the length of 3.'},
            {"input": 's = "bbbbb"', "output": "1", "explanation": 'The answer is "b", with the length of 1.'},
            {"input": 's = "pwwkew"', "output": "3", "explanation": 'The answer is "wke", with the length of 3.'},
        ],
        "constraints": ["0 <= s.length <= 5 * 10^4", "s consists of English letters, digits, symbols, and spaces."],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "abcabcbb", "expected_output": "3"},
            {"input": "bbbbb", "expected_output": "1"},
            {"input": "pwwkew", "expected_output": "3"},
            {"input": "", "expected_output": "0"},
            {"input": " ", "expected_output": "1"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(min(m,n))",
    },
    {
        "id": "course-schedule",
        "title": "Course Schedule",
        "difficulty": "Medium",
        "tags": ["Graphs", "Topological Sort", "BFS", "DFS"],
        "description": "There are a total of `numCourses` courses you have to take, labeled from 0 to numCourses - 1. You are given an array `prerequisites` where `prerequisites[i] = [a_i, b_i]` indicates that you must take course b_i first if you want to take course a_i.\n\nReturn true if you can finish all courses. Otherwise, return false.",
        "examples": [
            {"input": "numCourses = 2, prerequisites = [[1,0]]", "output": "true", "explanation": "Take course 0, then course 1."},
            {"input": "numCourses = 2, prerequisites = [[1,0],[0,1]]", "output": "false", "explanation": "There is a cycle."},
        ],
        "constraints": ["1 <= numCourses <= 2000", "0 <= prerequisites.length <= 5000", "prerequisites[i].length == 2", "0 <= a_i, b_i < numCourses", "All prerequisites pairs are unique."],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "testCases": [
            {"input": "2\n1\n1 0", "expected_output": "true"},
            {"input": "2\n2\n1 0\n0 1", "expected_output": "false"},
            {"input": "3\n2\n1 0\n2 1", "expected_output": "true"},
        ],
        "optimalTimeComplexity": "O(V+E)",
        "optimalSpaceComplexity": "O(V+E)",
    },
    {
        "id": "contains-duplicate",
        "title": "Contains Duplicate",
        "difficulty": "Easy",
        "tags": ["Arrays", "Hash Set"],
        "description": "Given an integer array `nums`, return true if any value appears at least twice in the array, and return false if every element is distinct.",
        "examples": [{"input": "nums = [1,2,3,1]", "output": "true"}, {"input": "nums = [1,2,3,4]", "output": "false"}],
        "constraints": ["1 <= nums.length <= 10^5", "-10^9 <= nums[i] <= 10^9"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "binary-search",
        "title": "Binary Search",
        "difficulty": "Easy",
        "tags": ["Arrays", "Binary Search"],
        "description": "Given an array of integers `nums` which is sorted in ascending order, and an integer `target`, write a function to search `target` in `nums`. If `target` exists, then return its index. Otherwise, return `-1`.\n\nYou must write an algorithm with O(log n) runtime complexity.",
        "examples": [{"input": "nums = [-1,0,3,5,9,12], target = 9", "output": "4"}, {"input": "nums = [-1,0,3,5,9,12], target = 2", "output": "-1"}],
        "constraints": ["1 <= nums.length <= 10^4", "-10^4 < nums[i], target < 10^4"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "optimalTimeComplexity": "O(log n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "3sum",
        "title": "3Sum",
        "difficulty": "Medium",
        "tags": ["Arrays", "Two Pointers"],
        "description": "Given an integer array `nums`, return all the triplets `[nums[i], nums[j], nums[k]]` such that `i != j`, `i != k`, and `j != k`, and `nums[i] + nums[j] + nums[k] == 0`.\n\nNotice that the solution set must not contain duplicate triplets.",
        "examples": [{"input": "nums = [-1,0,1,2,-1,-4]", "output": "[[-1,-1,2],[-1,0,1]]"}, {"input": "nums = [0,1,1]", "output": "[]"}],
        "constraints": ["3 <= nums.length <= 3000", "-10^5 <= nums[i] <= 10^5"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "optimalTimeComplexity": "O(n^2)",
        "optimalSpaceComplexity": "O(log n) or O(n)",
    },
    {
        "id": "product-except-self",
        "title": "Product of Array Except Self",
        "difficulty": "Medium",
        "tags": ["Arrays", "Prefix Sum"],
        "description": "Given an integer array `nums`, return an array `answer` such that `answer[i]` is equal to the product of all the elements of `nums` except `nums[i]`.\n\nYou must write an algorithm that runs in O(n) time and without using the division operation.",
        "examples": [{"input": "nums = [1,2,3,4]", "output": "[24,12,8,6]"}, {"input": "nums = [-1,1,0,-3,3]", "output": "[0,0,9,0,0]"}],
        "constraints": ["2 <= nums.length <= 10^5", "-30 <= nums[i] <= 30"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1) output array excluded",
    },
    {
        "id": "coin-change",
        "title": "Coin Change",
        "difficulty": "Medium",
        "tags": ["DP"],
        "description": "You are given an integer array `coins` representing coins of different denominations and an integer `amount`. Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return `-1`.",
        "examples": [{"input": "coins = [1,2,5], amount = 11", "output": "3"}],
        "constraints": ["1 <= coins.length <= 12", "1 <= coins[i] <= 2^31 - 1", "0 <= amount <= 10^4"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "optimalTimeComplexity": "O(amount * len(coins))",
        "optimalSpaceComplexity": "O(amount)",
    },
    {
        "id": "word-break",
        "title": "Word Break",
        "difficulty": "Medium",
        "tags": ["DP", "Trie"],
        "description": "Given a string `s` and a dictionary of strings `wordDict`, return true if `s` can be segmented into a space-separated sequence of one or more dictionary words.",
        "examples": [{"input": "s = 'leetcode', wordDict = ['leet','code']", "output": "true"}],
        "constraints": ["1 <= s.length <= 300", "s and wordDict[i] consist of only lowercase English letters."],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "optimalTimeComplexity": "O(n^3)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "trapping-rain-water",
        "title": "Trapping Rain Water",
        "difficulty": "Hard",
        "tags": ["Arrays", "Two Pointers", "Stack"],
        "description": "Given `n` non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.",
        "examples": [{"input": "height = [0,1,0,2,1,0,1,3,2,1,2,1]", "output": "6"}],
        "constraints": ["n == height.length", "1 <= n <= 2 * 10^4", "0 <= height[i] <= 10^5"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "merge-k-sorted-lists",
        "title": "Merge k Sorted Lists",
        "difficulty": "Hard",
        "tags": ["Linked List", "Divide and Conquer", "Heap"],
        "description": "You are given an array of `k` linked-lists `lists`, each linked-list is sorted in ascending order.\n\nMerge all the linked-lists into one sorted linked-list and return it.",
        "examples": [{"input": "lists = [[1,4,5],[1,3,4],[2,6]]", "output": "[1,1,2,3,4,4,5,6]"}],
        "constraints": ["k == lists.length", "0 <= k <= 10^4"],
        "starterCode": {
            "python": "class Solution():\n    pass\n",
            "javascript": "class Solution {}\n",
            "java": "class Solution {}\n",
            "cpp": "class Solution {};\n",
        },
        "optimalTimeComplexity": "O(N log k)",
        "optimalSpaceComplexity": "O(1) with divide&conquer",
    },
    {
        "id": "reverse-linked-list",
        "title": "Reverse Linked List",
        "difficulty": "Easy",
        "tags": ["Linked List"],
        "description": "Given the `head` of a singly linked list, reverse the list, and return the reversed list.",
        "examples": [
            {"input": "head = [1,2,3,4,5]", "output": "[5,4,3,2,1]"},
            {"input": "head = [1,2]", "output": "[2,1]"},
            {"input": "head = []", "output": "[]"},
        ],
        "constraints": ["The number of nodes in the list is the range [0, 5000].", "-5000 <= Node.val <= 5000"],
        "starterCode": {
            "python": "class ListNode:\n    def __init__(self, val=0, next=None):\n        self.val = val\n        self.next = next\n\ndef reverseList(head: ListNode) -> ListNode:\n    # Write your solution here\n    pass\n",
            "javascript": "function reverseList(head) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public ListNode reverseList(ListNode head) {\n        return null;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    ListNode* reverseList(ListNode* head) {\n        return nullptr;\n    }\n};\n",
        },
        "testCases": [
            {"input": "5\n1 2 3 4 5", "expected_output": "5 4 3 2 1"},
            {"input": "2\n1 2", "expected_output": "2 1"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "best-time-to-buy-and-sell-stock",
        "title": "Best Time to Buy and Sell Stock",
        "difficulty": "Easy",
        "tags": ["Arrays", "DP"],
        "description": "You are given an array `prices` where `prices[i]` is the price of a given stock on the ith day.\n\nYou want to maximize your profit by choosing a single day to buy and a single day to sell. Return the maximum profit you can achieve. If you cannot achieve any profit, return 0.",
        "examples": [
            {"input": "prices = [7,1,5,3,6,4]", "output": "5", "explanation": "Buy on day 2 (price = 1) and sell on day 5 (price = 6), profit = 5."},
            {"input": "prices = [7,6,4,3,1]", "output": "0", "explanation": "No profitable transaction possible."},
        ],
        "constraints": ["1 <= prices.length <= 10^5", "0 <= prices[i] <= 10^4"],
        "starterCode": {
            "python": "def maxProfit(prices: list[int]) -> int:\n    pass\n",
            "javascript": "function maxProfit(prices) {\n}\n",
            "java": "class Solution {\n    public int maxProfit(int[] prices) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int maxProfit(vector<int>& prices) {\n        return 0;\n    }\n};\n",
        },
        "testCases": [
            {"input": "6\n7 1 5 3 6 4", "expected_output": "5"},
            {"input": "5\n7 6 4 3 1", "expected_output": "0"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "group-anagrams",
        "title": "Group Anagrams",
        "difficulty": "Medium",
        "tags": ["Arrays", "Hash Map", "Sorting"],
        "description": "Given an array of strings `strs`, group the anagrams together. You can return the answer in any order.",
        "examples": [
            {"input": 'strs = ["eat","tea","tan","ate","nat","bat"]', "output": '[["bat"],["nat","tan"],["ate","eat","tea"]]'},
            {"input": 'strs = [""]', "output": '[[""]]'},
        ],
        "constraints": ["1 <= strs.length <= 10^4", "0 <= strs[i].length <= 100", "strs[i] consists of lowercase English letters."],
        "starterCode": {
            "python": "def groupAnagrams(strs: list[str]) -> list[list[str]]:\n    pass\n",
            "javascript": "function groupAnagrams(strs) {\n}\n",
            "java": "class Solution {\n    public List<List<String>> groupAnagrams(String[] strs) {\n        return new ArrayList<>();\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<vector<string>> groupAnagrams(vector<string>& strs) {\n        return {};\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n * k log k)",
        "optimalSpaceComplexity": "O(n * k)",
    },
    {
        "id": "jump-game",
        "title": "Jump Game",
        "difficulty": "Medium",
        "tags": ["Arrays", "Greedy"],
        "description": "You are given an integer array `nums`. You are initially positioned at the array's first index, and each element represents your maximum jump length at that position.\n\nReturn `true` if you can reach the last index, or `false` otherwise.",
        "examples": [
            {"input": "nums = [2,3,1,1,4]", "output": "true", "explanation": "Jump 1 step from index 0 to 1, then 3 steps to the last index."},
            {"input": "nums = [3,2,1,0,4]", "output": "false"},
        ],
        "constraints": ["1 <= nums.length <= 10^4", "0 <= nums[i] <= 10^5"],
        "starterCode": {
            "python": "def canJump(nums: list[int]) -> bool:\n    pass\n",
            "javascript": "function canJump(nums) {\n}\n",
            "java": "class Solution {\n    public boolean canJump(int[] nums) {\n        return false;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    bool canJump(vector<int>& nums) {\n        return false;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "house-robber",
        "title": "House Robber",
        "difficulty": "Medium",
        "tags": ["DP"],
        "description": "You are a professional robber planning to rob houses along a street. Each house has a certain amount of money stashed. Adjacent houses have security systems connected — if two adjacent houses are broken into on the same night, the police will be alerted.\n\nGiven an integer array `nums` representing the amount of money at each house, return the maximum amount you can rob without alerting the police.",
        "examples": [
            {"input": "nums = [1,2,3,1]", "output": "4", "explanation": "Rob house 1 (1) + house 3 (3) = 4."},
            {"input": "nums = [2,7,9,3,1]", "output": "12", "explanation": "Rob house 1 (2) + house 3 (9) + house 5 (1) = 12."},
        ],
        "constraints": ["1 <= nums.length <= 100", "0 <= nums[i] <= 400"],
        "starterCode": {
            "python": "def rob(nums: list[int]) -> int:\n    pass\n",
            "javascript": "function rob(nums) {\n}\n",
            "java": "class Solution {\n    public int rob(int[] nums) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int rob(vector<int>& nums) {\n        return 0;\n    }\n};\n",
        },
        "testCases": [
            {"input": "4\n1 2 3 1", "expected_output": "4"},
            {"input": "5\n2 7 9 3 1", "expected_output": "12"},
        ],
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "unique-paths",
        "title": "Unique Paths",
        "difficulty": "Medium",
        "tags": ["DP", "Math"],
        "description": "There is a robot on an `m x n` grid. The robot is initially at the top-left corner and tries to move to the bottom-right corner. It can only move either down or right at any point.\n\nGiven `m` and `n`, return the number of possible unique paths.",
        "examples": [
            {"input": "m = 3, n = 7", "output": "28"},
            {"input": "m = 3, n = 2", "output": "3"},
        ],
        "constraints": ["1 <= m, n <= 100"],
        "starterCode": {
            "python": "def uniquePaths(m: int, n: int) -> int:\n    pass\n",
            "javascript": "function uniquePaths(m, n) {\n}\n",
            "java": "class Solution {\n    public int uniquePaths(int m, int n) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int uniquePaths(int m, int n) {\n        return 0;\n    }\n};\n",
        },
        "testCases": [
            {"input": "3 7", "expected_output": "28"},
            {"input": "3 2", "expected_output": "3"},
            {"input": "1 1", "expected_output": "1"},
        ],
        "optimalTimeComplexity": "O(m*n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "rotting-oranges",
        "title": "Rotting Oranges",
        "difficulty": "Medium",
        "tags": ["Arrays", "BFS", "Matrix"],
        "description": "You are given an `m x n` grid where each cell can have one of three values:\n- `0` — empty cell\n- `1` — fresh orange\n- `2` — rotten orange\n\nEvery minute, any fresh orange that is 4-directionally adjacent to a rotten orange becomes rotten. Return the minimum number of minutes until no fresh orange remains. If this is impossible, return `-1`.",
        "examples": [
            {"input": "grid = [[2,1,1],[1,1,0],[0,1,1]]", "output": "4"},
            {"input": "grid = [[2,1,1],[0,1,1],[1,0,1]]", "output": "-1"},
            {"input": "grid = [[0,2]]", "output": "0"},
        ],
        "constraints": ["m == grid.length", "n == grid[i].length", "1 <= m, n <= 10", "grid[i][j] is 0, 1, or 2."],
        "starterCode": {
            "python": "def orangesRotting(grid: list[list[int]]) -> int:\n    pass\n",
            "javascript": "function orangesRotting(grid) {\n}\n",
            "java": "class Solution {\n    public int orangesRotting(int[][] grid) {\n        return -1;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int orangesRotting(vector<vector<int>>& grid) {\n        return -1;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(m*n)",
        "optimalSpaceComplexity": "O(m*n)",
    },
    {
        "id": "spiral-matrix",
        "title": "Spiral Matrix",
        "difficulty": "Medium",
        "tags": ["Arrays", "Simulation"],
        "description": "Given an `m x n` matrix, return all elements of the matrix in spiral order.",
        "examples": [{"input": "matrix = [[1,2,3],[4,5,6],[7,8,9]]", "output": "[1,2,3,6,9,8,7,4,5]"}],
        "constraints": ["m == matrix.length", "n == matrix[i].length", "1 <= m, n <= 10"],
        "starterCode": {
            "python": "def spiralOrder(matrix: list[list[int]]) -> list[int]:\n    pass\n",
            "javascript": "function spiralOrder(matrix) {\n}\n",
            "java": "class Solution {\n    public List<Integer> spiralOrder(int[][] matrix) {\n        return new ArrayList<>();\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<int> spiralOrder(vector<vector<int>>& matrix) {\n        return {};\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(m*n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "set-matrix-zeroes",
        "title": "Set Matrix Zeroes",
        "difficulty": "Medium",
        "tags": ["Arrays", "Matrix"],
        "description": "Given an `m x n` integer matrix, if an element is `0`, set its entire row and column to `0`'s. You must do it in place.",
        "examples": [{"input": "matrix = [[1,1,1],[1,0,1],[1,1,1]]", "output": "[[1,0,1],[0,0,0],[1,0,1]]"}],
        "constraints": ["m == matrix.length", "n == matrix[0].length", "1 <= m, n <= 200"],
        "starterCode": {
            "python": "def setZeroes(matrix: list[list[int]]) -> None:\n    pass\n",
            "javascript": "function setZeroes(matrix) {\n}\n",
            "java": "class Solution {\n    public void setZeroes(int[][] matrix) {\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    void setZeroes(vector<vector<int>>& matrix) {\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(m*n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "find-the-duplicate-number",
        "title": "Find the Duplicate Number",
        "difficulty": "Medium",
        "tags": ["Arrays", "Two Pointers"],
        "description": "Given an array of integers `nums` containing `n + 1` integers where each integer is in the range `[1, n]` inclusive, there is only one repeated number. Return this repeated number.\n\nYou must solve it without modifying the array and using only constant extra space.",
        "examples": [{"input": "nums = [1,3,4,2,2]", "output": "2"}, {"input": "nums = [3,1,3,4,2]", "output": "3"}],
        "constraints": ["1 <= n <= 10^5", "nums.length == n + 1", "1 <= nums[i] <= n"],
        "starterCode": {
            "python": "def findDuplicate(nums: list[int]) -> int:\n    pass\n",
            "javascript": "function findDuplicate(nums) {\n}\n",
            "java": "class Solution {\n    public int findDuplicate(int[] nums) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int findDuplicate(vector<int>& nums) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "maximum-subarray",
        "title": "Maximum Subarray",
        "difficulty": "Medium",
        "tags": ["Arrays", "DP", "Kadane's Algorithm"],
        "description": "Given an integer array `nums`, find the subarray with the largest sum, and return its sum.",
        "examples": [{"input": "nums = [-2,1,-3,4,-1,2,1,-5,4]", "output": "6", "explanation": "The subarray [4,-1,2,1] has the largest sum 6."}],
        "constraints": ["1 <= nums.length <= 10^5", "-10^4 <= nums[i] <= 10^4"],
        "starterCode": {
            "python": "def maxSubArray(nums: list[int]) -> int:\n    pass\n",
            "javascript": "function maxSubArray(nums) {\n}\n",
            "java": "class Solution {\n    public int maxSubArray(int[] nums) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int maxSubArray(vector<int>& nums) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "maximum-product-subarray",
        "title": "Maximum Product Subarray",
        "difficulty": "Medium",
        "tags": ["Arrays", "DP"],
        "description": "Given an integer array `nums`, find a subarray that has the largest product, and return the product.",
        "examples": [{"input": "nums = [2,3,-2,4]", "output": "6"}, {"input": "nums = [-2,0,-1]", "output": "0"}],
        "constraints": ["1 <= nums.length <= 2 * 10^4", "-10 <= nums[i] <= 10"],
        "starterCode": {
            "python": "def maxProduct(nums: list[int]) -> int:\n    pass\n",
            "javascript": "function maxProduct(nums) {\n}\n",
            "java": "class Solution {\n    public int maxProduct(int[] nums) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int maxProduct(vector<int>& nums) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "longest-increasing-subsequence",
        "title": "Longest Increasing Subsequence",
        "difficulty": "Medium",
        "tags": ["Arrays", "DP", "Binary Search"],
        "description": "Given an integer array `nums`, return the length of the longest strictly increasing subsequence.",
        "examples": [{"input": "nums = [10,9,2,5,3,7,101,18]", "output": "4", "explanation": "[2,3,7,101]"}],
        "constraints": ["1 <= nums.length <= 2500", "-10^4 <= nums[i] <= 10^4"],
        "starterCode": {
            "python": "def lengthOfLIS(nums: list[int]) -> int:\n    pass\n",
            "javascript": "function lengthOfLIS(nums) {\n}\n",
            "java": "class Solution {\n    public int lengthOfLIS(int[] nums) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int lengthOfLIS(vector<int>& nums) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n log n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "edit-distance",
        "title": "Edit Distance",
        "difficulty": "Medium",
        "tags": ["DP", "Strings"],
        "description": "Given two strings `word1` and `word2`, return the minimum number of operations required to convert `word1` to `word2`.\n\nYou have three operations: insert, delete, or replace a character.",
        "examples": [{"input": 'word1 = "horse", word2 = "ros"', "output": "3"}, {"input": 'word1 = "intention", word2 = "execution"', "output": "5"}],
        "constraints": ["0 <= word1.length, word2.length <= 500"],
        "starterCode": {
            "python": "def minDistance(word1: str, word2: str) -> int:\n    pass\n",
            "javascript": "function minDistance(word1, word2) {\n}\n",
            "java": "class Solution {\n    public int minDistance(String word1, String word2) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int minDistance(string word1, string word2) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(m*n)",
        "optimalSpaceComplexity": "O(m*n)",
    },
    {
        "id": "decode-ways",
        "title": "Decode Ways",
        "difficulty": "Medium",
        "tags": ["DP", "Strings"],
        "description": "A message containing letters from A-Z can be encoded by mapping 'A' -> \"1\", 'B' -> \"2\", ..., 'Z' -> \"26\".\n\nGiven a string `s` containing only digits, return the number of ways to decode it.",
        "examples": [{"input": 's = "12"', "output": "2", "explanation": '"12" could be decoded as "AB" (1 2) or "L" (12).'}, {"input": 's = "226"', "output": "3"}],
        "constraints": ["1 <= s.length <= 100", "s contains only digits and may contain leading zeros."],
        "starterCode": {
            "python": "def numDecodings(s: str) -> int:\n    pass\n",
            "javascript": "function numDecodings(s) {\n}\n",
            "java": "class Solution {\n    public int numDecodings(String s) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int numDecodings(string s) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "pascals-triangle",
        "title": "Pascal's Triangle",
        "difficulty": "Easy",
        "tags": ["Arrays", "DP"],
        "description": "Given an integer `numRows`, return the first numRows of Pascal's triangle.",
        "examples": [{"input": "numRows = 5", "output": "[[1],[1,1],[1,2,1],[1,3,3,1],[1,4,6,4,1]]"}],
        "constraints": ["1 <= numRows <= 30"],
        "starterCode": {
            "python": "def generate(numRows: int) -> list[list[int]]:\n    pass\n",
            "javascript": "function generate(numRows) {\n}\n",
            "java": "class Solution {\n    public List<List<Integer>> generate(int numRows) {\n        return new ArrayList<>();\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<vector<int>> generate(int numRows) {\n        return {};\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n^2)",
        "optimalSpaceComplexity": "O(n^2)",
    },
    {
        "id": "valid-sudoku",
        "title": "Valid Sudoku",
        "difficulty": "Medium",
        "tags": ["Arrays", "Hash Map"],
        "description": "Determine if a `9 x 9` Sudoku board is valid. Only the filled cells need to be validated according to the rules:\n\n1. Each row must contain the digits 1-9 without repetition.\n2. Each column must contain the digits 1-9 without repetition.\n3. Each of the nine 3 x 3 sub-boxes must contain the digits 1-9 without repetition.",
        "examples": [{"input": "board = (see LeetCode #36)", "output": "true"}],
        "constraints": ["board.length == 9", "board[i].length == 9", "board[i][j] is a digit 1-9 or '.'."],
        "starterCode": {
            "python": "def isValidSudoku(board: list[list[str]]) -> bool:\n    pass\n",
            "javascript": "function isValidSudoku(board) {\n}\n",
            "java": "class Solution {\n    public boolean isValidSudoku(char[][] board) {\n        return false;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    bool isValidSudoku(vector<vector<char>>& board) {\n        return false;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(1)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "median-of-two-sorted-arrays",
        "title": "Median of Two Sorted Arrays",
        "difficulty": "Hard",
        "tags": ["Arrays", "Binary Search"],
        "description": "Given two sorted arrays `nums1` and `nums2` of size m and n respectively, return the median of the two sorted arrays.\n\nThe overall run time complexity should be O(log (m+n)).",
        "examples": [{"input": "nums1 = [1,3], nums2 = [2]", "output": "2.0"}, {"input": "nums1 = [1,2], nums2 = [3,4]", "output": "2.5"}],
        "constraints": ["0 <= m <= 1000", "0 <= n <= 1000", "1 <= m + n <= 2000"],
        "starterCode": {
            "python": "def findMedianSortedArrays(nums1: list[int], nums2: list[int]) -> float:\n    pass\n",
            "javascript": "function findMedianSortedArrays(nums1, nums2) {\n}\n",
            "java": "class Solution {\n    public double findMedianSortedArrays(int[] nums1, int[] nums2) {\n        return 0.0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    double findMedianSortedArrays(vector<int>& nums1, vector<int>& nums2) {\n        return 0.0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(log(min(m,n)))",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "serialize-and-deserialize-binary-tree",
        "title": "Serialize and Deserialize Binary Tree",
        "difficulty": "Hard",
        "tags": ["Trees", "DFS", "BFS", "Design"],
        "description": "Design an algorithm to serialize and deserialize a binary tree. Serialization is the process of converting a tree to a string, and deserialization is reconstructing the tree from a string.",
        "examples": [{"input": "root = [1,2,3,null,null,4,5]", "output": "[1,2,3,null,null,4,5]"}],
        "constraints": ["The number of nodes is in range [0, 10^4].", "-1000 <= Node.val <= 1000"],
        "starterCode": {
            "python": "class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val\n        self.left = left\n        self.right = right\n\nclass Codec:\n    def serialize(self, root) -> str:\n        pass\n\n    def deserialize(self, data: str):\n        pass\n",
            "javascript": "function serialize(root) {\n}\nfunction deserialize(data) {\n}\n",
            "java": "public class Codec {\n    public String serialize(TreeNode root) {\n        return \"\";\n    }\n    public TreeNode deserialize(String data) {\n        return null;\n    }\n}\n",
            "cpp": "class Codec {\npublic:\n    string serialize(TreeNode* root) {\n        return \"\";\n    }\n    TreeNode* deserialize(string data) {\n        return nullptr;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "word-ladder",
        "title": "Word Ladder",
        "difficulty": "Hard",
        "tags": ["Hash Map", "BFS", "Strings"],
        "description": "Given two words `beginWord` and `endWord`, and a dictionary `wordList`, return the number of words in the shortest transformation sequence from `beginWord` to `endWord`, or `0` if no such sequence exists.\n\nEach adjacent pair of words differs by a single letter.",
        "examples": [{"input": 'beginWord = "hit", endWord = "cog", wordList = ["hot","dot","dog","lot","log","cog"]', "output": "5"}],
        "constraints": ["1 <= beginWord.length <= 10", "All words have the same length.", "All words consist of lowercase English letters."],
        "starterCode": {
            "python": "def ladderLength(beginWord: str, endWord: str, wordList: list[str]) -> int:\n    pass\n",
            "javascript": "function ladderLength(beginWord, endWord, wordList) {\n}\n",
            "java": "class Solution {\n    public int ladderLength(String beginWord, String endWord, List<String> wordList) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int ladderLength(string beginWord, string endWord, vector<string>& wordList) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(M^2 * N)",
        "optimalSpaceComplexity": "O(M^2 * N)",
    },
    {
        "id": "meeting-rooms-ii",
        "title": "Meeting Rooms II",
        "difficulty": "Medium",
        "tags": ["Arrays", "Sorting", "Heap"],
        "description": "Given an array of meeting time intervals `intervals` where `intervals[i] = [start_i, end_i]`, return the minimum number of conference rooms required.",
        "examples": [{"input": "intervals = [[0,30],[5,10],[15,20]]", "output": "2"}, {"input": "intervals = [[7,10],[2,4]]", "output": "1"}],
        "constraints": ["1 <= intervals.length <= 10^4", "0 <= start_i < end_i <= 10^6"],
        "starterCode": {
            "python": "def minMeetingRooms(intervals: list[list[int]]) -> int:\n    pass\n",
            "javascript": "function minMeetingRooms(intervals) {\n}\n",
            "java": "class Solution {\n    public int minMeetingRooms(int[][] intervals) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int minMeetingRooms(vector<vector<int>>& intervals) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n log n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "min-cost-climbing-stairs",
        "title": "Min Cost Climbing Stairs",
        "difficulty": "Easy",
        "tags": ["DP"],
        "description": "You are given an integer array `cost` where `cost[i]` is the cost of the ith step. You can start from step 0 or step 1. Once you pay the cost, you can climb one or two steps.\n\nReturn the minimum cost to reach the top of the floor.",
        "examples": [{"input": "cost = [10,15,20]", "output": "15"}, {"input": "cost = [1,100,1,1,1,100,1,1,100,1]", "output": "6"}],
        "constraints": ["2 <= cost.length <= 1000", "0 <= cost[i] <= 999"],
        "starterCode": {
            "python": "def minCostClimbingStairs(cost: list[int]) -> int:\n    pass\n",
            "javascript": "function minCostClimbingStairs(cost) {\n}\n",
            "java": "class Solution {\n    public int minCostClimbingStairs(int[] cost) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int minCostClimbingStairs(vector<int>& cost) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "minimum-window-substring",
        "title": "Minimum Window Substring",
        "difficulty": "Hard",
        "tags": ["Hash Map", "Sliding Window", "Strings"],
        "description": "Given two strings `s` and `t`, return the minimum window substring of `s` such that every character in `t` (including duplicates) is included in the window. If there is no such substring, return the empty string.",
        "examples": [{"input": 's = "ADOBECODEBANC", t = "ABC"', "output": '"BANC"'}],
        "constraints": ["1 <= s.length, t.length <= 10^5", "s and t consist of uppercase and lowercase English letters."],
        "starterCode": {
            "python": "def minWindow(s: str, t: str) -> str:\n    pass\n",
            "javascript": "function minWindow(s, t) {\n}\n",
            "java": "class Solution {\n    public String minWindow(String s, String t) {\n        return \"\";\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    string minWindow(string s, string t) {\n        return \"\";\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(|s| + |t|)",
        "optimalSpaceComplexity": "O(|s| + |t|)",
    },
    {
        "id": "subarray-sum-equals-k",
        "title": "Subarray Sum Equals K",
        "difficulty": "Medium",
        "tags": ["Arrays", "Hash Map", "Prefix Sum"],
        "description": "Given an array of integers `nums` and an integer `k`, return the total number of subarrays whose sum equals to `k`.",
        "examples": [{"input": "nums = [1,1,1], k = 2", "output": "2"}, {"input": "nums = [1,2,3], k = 3", "output": "2"}],
        "constraints": ["1 <= nums.length <= 2 * 10^4", "-1000 <= nums[i] <= 1000"],
        "starterCode": {
            "python": "def subarraySum(nums: list[int], k: int) -> int:\n    pass\n",
            "javascript": "function subarraySum(nums, k) {\n}\n",
            "java": "class Solution {\n    public int subarraySum(int[] nums, int k) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int subarraySum(vector<int>& nums, int k) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "first-missing-positive",
        "title": "First Missing Positive",
        "difficulty": "Hard",
        "tags": ["Arrays", "Hash Map"],
        "description": "Given an unsorted integer array `nums`, return the smallest missing positive integer.\n\nYou must implement an algorithm that runs in O(n) time and uses O(1) auxiliary space.",
        "examples": [{"input": "nums = [1,2,0]", "output": "3"}, {"input": "nums = [3,4,-1,1]", "output": "2"}],
        "constraints": ["1 <= nums.length <= 10^5", "-2^31 <= nums[i] <= 2^31 - 1"],
        "starterCode": {
            "python": "def firstMissingPositive(nums: list[int]) -> int:\n    pass\n",
            "javascript": "function firstMissingPositive(nums) {\n}\n",
            "java": "class Solution {\n    public int firstMissingPositive(int[] nums) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int firstMissingPositive(vector<int>& nums) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n)",
        "optimalSpaceComplexity": "O(1)",
    },
    {
        "id": "palindrome-partitioning",
        "title": "Palindrome Partitioning",
        "difficulty": "Medium",
        "tags": ["DP", "Backtracking", "Strings"],
        "description": "Given a string `s`, partition `s` such that every substring of the partition is a palindrome. Return all possible palindrome partitionings of `s`.",
        "examples": [{"input": 's = "aab"', "output": '[["a","a","b"],["aa","b"]]'}],
        "constraints": ["1 <= s.length <= 16", "s contains only lowercase English letters."],
        "starterCode": {
            "python": "def partition(s: str) -> list[list[str]]:\n    pass\n",
            "javascript": "function partition(s) {\n}\n",
            "java": "class Solution {\n    public List<List<String>> partition(String s) {\n        return new ArrayList<>();\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<vector<string>> partition(string s) {\n        return {};\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n * 2^n)",
        "optimalSpaceComplexity": "O(n)",
    },
    {
        "id": "wildcard-matching",
        "title": "Wildcard Matching",
        "difficulty": "Hard",
        "tags": ["DP", "Greedy", "Strings"],
        "description": "Given an input string `s` and a pattern `p`, implement wildcard pattern matching with support for '?' (matches any single character) and '*' (matches any sequence of characters, including empty).",
        "examples": [{"input": 's = "aa", p = "a"', "output": "false"}, {"input": 's = "aa", p = "*"', "output": "true"}],
        "constraints": ["0 <= s.length, p.length <= 2000"],
        "starterCode": {
            "python": "def isMatch(s: str, p: str) -> bool:\n    pass\n",
            "javascript": "function isMatch(s, p) {\n}\n",
            "java": "class Solution {\n    public boolean isMatch(String s, String p) {\n        return false;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    bool isMatch(string s, string p) {\n        return false;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(m*n)",
        "optimalSpaceComplexity": "O(m*n)",
    },
    {
        "id": "regular-expression-matching",
        "title": "Regular Expression Matching",
        "difficulty": "Hard",
        "tags": ["DP", "Recursion", "Strings"],
        "description": "Given an input string `s` and a pattern `p`, implement regular expression matching with support for '.' (matches any single character) and '*' (matches zero or more of the preceding element).",
        "examples": [{"input": 's = "aa", p = "a"', "output": "false"}, {"input": 's = "aa", p = "a*"', "output": "true"}],
        "constraints": ["1 <= s.length <= 20", "1 <= p.length <= 20"],
        "starterCode": {
            "python": "def isMatch(s: str, p: str) -> bool:\n    pass\n",
            "javascript": "function isMatch(s, p) {\n}\n",
            "java": "class Solution {\n    public boolean isMatch(String s, String p) {\n        return false;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    bool isMatch(string s, string p) {\n        return false;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(m*n)",
        "optimalSpaceComplexity": "O(m*n)",
    },
    {
        "id": "burst-balloons",
        "title": "Burst Balloons",
        "difficulty": "Hard",
        "tags": ["DP"],
        "description": "You are given `n` balloons, indexed from 0 to n-1. Each balloon is painted with a number on it represented by an array `nums`. You are asked to burst all the balloons.\n\nIf you burst the ith balloon, you will get `nums[i-1] * nums[i] * nums[i+1]` coins. Return the maximum coins you can collect.",
        "examples": [{"input": "nums = [3,1,5,8]", "output": "167"}],
        "constraints": ["n == nums.length", "1 <= n <= 300", "0 <= nums[i] <= 100"],
        "starterCode": {
            "python": "def maxCoins(nums: list[int]) -> int:\n    pass\n",
            "javascript": "function maxCoins(nums) {\n}\n",
            "java": "class Solution {\n    public int maxCoins(int[] nums) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int maxCoins(vector<int>& nums) {\n        return 0;\n    }\n};\n",
        },
        "optimalTimeComplexity": "O(n^3)",
        "optimalSpaceComplexity": "O(n^2)",
    },
]


def get_random_problem(
    tags: Optional[list[str]] = None,
    difficulty: Optional[str] = None,
    exclude_ids: Optional[list[str]] = None,
) -> dict:
    problems = _get_problems()
    filtered = problems

    if tags:
        filtered = [p for p in filtered if any(t in p["tags"] for t in tags)]
    if difficulty:
        filtered = [p for p in filtered if p["difficulty"] == difficulty]
    if exclude_ids:
        filtered = [p for p in filtered if p["id"] not in exclude_ids]
    if not filtered:
        filtered = problems

    return random.choice(filtered)


def get_problem_by_id(problem_id: str) -> Optional[dict]:
    return next((p for p in _get_problems() if p["id"] == problem_id), None)


def get_all_problems() -> list[dict]:
    return _get_problems()
