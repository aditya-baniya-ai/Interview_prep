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
        if not service_account_path or not os.path.exists(service_account_path):
            return []

        if not firebase_admin._apps:
            cred = credentials.Certificate(service_account_path)
            firebase_admin.initialize_app(cred)

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
            "python": "def twoSum(nums: list[int], target: int) -> list[int]:\n    # Write your solution here\n    pass\n",
            "javascript": "function twoSum(nums, target) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public int[] twoSum(int[] nums, int target) {\n        // Write your solution here\n        return new int[]{};\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) {\n        // Write your solution here\n        return {};\n    }\n};\n",
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
            "python": "def isValid(s: str) -> bool:\n    # Write your solution here\n    pass\n",
            "javascript": "function isValid(s) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public boolean isValid(String s) {\n        // Write your solution here\n        return false;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    bool isValid(string s) {\n        // Write your solution here\n        return false;\n    }\n};\n",
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
            "python": "def maxSubArray(nums: list[int]) -> int:\n    # Write your solution here\n    pass\n",
            "javascript": "function maxSubArray(nums) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public int maxSubArray(int[] nums) {\n        // Write your solution here\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int maxSubArray(vector<int>& nums) {\n        // Write your solution here\n        return 0;\n    }\n};\n",
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
            "python": "def merge(intervals: list[list[int]]) -> list[list[int]]:\n    # Write your solution here\n    pass\n",
            "javascript": "function merge(intervals) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public int[][] merge(int[][] intervals) {\n        // Write your solution here\n        return new int[][]{};\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<vector<int>> merge(vector<vector<int>>& intervals) {\n        // Write your solution here\n        return {};\n    }\n};\n",
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
            "python": "from collections import deque\nfrom typing import Optional, List\n\nclass TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val\n        self.left = left\n        self.right = right\n\ndef levelOrder(root: Optional[TreeNode]) -> List[List[int]]:\n    # Write your solution here\n    pass\n",
            "javascript": "function levelOrder(root) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public List<List<Integer>> levelOrder(TreeNode root) {\n        // Write your solution here\n        return new ArrayList<>();\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<vector<int>> levelOrder(TreeNode* root) {\n        // Write your solution here\n        return {};\n    }\n};\n",
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
            "python": "def numIslands(grid: list[list[str]]) -> int:\n    # Write your solution here\n    pass\n",
            "javascript": "function numIslands(grid) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public int numIslands(char[][] grid) {\n        // Write your solution here\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int numIslands(vector<vector<char>>& grid) {\n        // Write your solution here\n        return 0;\n    }\n};\n",
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
            "python": "class LRUCache:\n    def __init__(self, capacity: int):\n        # Write your solution here\n        pass\n\n    def get(self, key: int) -> int:\n        pass\n\n    def put(self, key: int, value: int) -> None:\n        pass\n",
            "javascript": "class LRUCache {\n    constructor(capacity) {\n        // Write your solution here\n    }\n\n    get(key) {\n        \n    }\n\n    put(key, value) {\n        \n    }\n}\n",
            "java": "class LRUCache {\n    public LRUCache(int capacity) {\n        // Write your solution here\n    }\n\n    public int get(int key) {\n        return -1;\n    }\n\n    public void put(int key, int value) {\n        \n    }\n}\n",
            "cpp": "class LRUCache {\npublic:\n    LRUCache(int capacity) {\n        // Write your solution here\n    }\n\n    int get(int key) {\n        return -1;\n    }\n\n    void put(int key, int value) {\n        \n    }\n};\n",
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
            "python": "def climbStairs(n: int) -> int:\n    # Write your solution here\n    pass\n",
            "javascript": "function climbStairs(n) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public int climbStairs(int n) {\n        // Write your solution here\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int climbStairs(int n) {\n        // Write your solution here\n        return 0;\n    }\n};\n",
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
            "python": "def lengthOfLongestSubstring(s: str) -> int:\n    # Write your solution here\n    pass\n",
            "javascript": "function lengthOfLongestSubstring(s) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public int lengthOfLongestSubstring(String s) {\n        // Write your solution here\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int lengthOfLongestSubstring(string s) {\n        // Write your solution here\n        return 0;\n    }\n};\n",
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
            "python": "def canFinish(numCourses: int, prerequisites: list[list[int]]) -> bool:\n    # Write your solution here\n    pass\n",
            "javascript": "function canFinish(numCourses, prerequisites) {\n    // Write your solution here\n}\n",
            "java": "class Solution {\n    public boolean canFinish(int numCourses, int[][] prerequisites) {\n        // Write your solution here\n        return false;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    bool canFinish(int numCourses, vector<vector<int>>& prerequisites) {\n        // Write your solution here\n        return false;\n    }\n};\n",
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
            "python": "def containsDuplicate(nums: list[int]) -> bool:\n    pass\n",
            "javascript": "function containsDuplicate(nums) {\n}\n",
            "java": "class Solution {\n    public boolean containsDuplicate(int[] nums) {\n        return false;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    bool containsDuplicate(vector<int>& nums) {\n        return false;\n    }\n};\n",
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
            "python": "def search(nums: list[int], target: int) -> int:\n    pass\n",
            "javascript": "function search(nums, target) {\n}\n",
            "java": "class Solution {\n    public int search(int[] nums, int target) {\n        return -1;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int search(vector<int>& nums, int target) {\n        return -1;\n    }\n};\n",
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
            "python": "def threeSum(nums: list[int]) -> list[list[int]]:\n    pass\n",
            "javascript": "function threeSum(nums) {\n}\n",
            "java": "class Solution {\n    public List<List<Integer>> threeSum(int[] nums) {\n        return new ArrayList<>();\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<vector<int>> threeSum(vector<int>& nums) {\n        return {};\n    }\n};\n",
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
            "python": "def productExceptSelf(nums: list[int]) -> list[int]:\n    pass\n",
            "javascript": "function productExceptSelf(nums) {\n}\n",
            "java": "class Solution {\n    public int[] productExceptSelf(int[] nums) {\n        return new int[]{};\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    vector<int> productExceptSelf(vector<int>& nums) {\n        return {};\n    }\n};\n",
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
            "python": "def coinChange(coins: list[int], amount: int) -> int:\n    pass\n",
            "javascript": "function coinChange(coins, amount) {\n}\n",
            "java": "class Solution {\n    public int coinChange(int[] coins, int amount) {\n        return -1;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int coinChange(vector<int>& coins, int amount) {\n        return -1;\n    }\n};\n",
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
            "python": "def wordBreak(s: str, wordDict: list[str]) -> bool:\n    pass\n",
            "javascript": "function wordBreak(s, wordDict) {\n}\n",
            "java": "class Solution {\n    public boolean wordBreak(String s, List<String> wordDict) {\n        return false;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    bool wordBreak(string s, vector<string>& wordDict) {\n        return false;\n    }\n};\n",
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
            "python": "def trap(height: list[int]) -> int:\n    pass\n",
            "javascript": "function trap(height) {\n}\n",
            "java": "class Solution {\n    public int trap(int[] height) {\n        return 0;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    int trap(vector<int>& height) {\n        return 0;\n    }\n};\n",
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
            "python": "def mergeKLists(lists) :\n    pass\n",
            "javascript": "function mergeKLists(lists) {\n}\n",
            "java": "class Solution {\n    public ListNode mergeKLists(ListNode[] lists) {\n        return null;\n    }\n}\n",
            "cpp": "class Solution {\npublic:\n    ListNode* mergeKLists(vector<ListNode*>& lists) {\n        return nullptr;\n    }\n};\n",
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
