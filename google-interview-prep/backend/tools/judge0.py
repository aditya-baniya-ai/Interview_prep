"""
Judge0 API integration — Sandboxed code execution.

Submits code to a self-hosted Judge0 instance and returns execution results.
"""

import httpx
import asyncio
import base64
from typing import Optional
from config import JUDGE0_API_URL, LANGUAGE_IDS


async def submit_code(
    source_code: str,
    language: str,
    stdin: str = "",
    expected_output: str = "",
    time_limit: float = 10.0,
    memory_limit: int = 128000,
) -> dict:
    """Submit code to Judge0 for execution.

    Args:
        source_code: The code to execute
        language: Programming language (python, javascript, java, cpp)
        stdin: Standard input for the program
        expected_output: Expected output for comparison
        time_limit: Maximum execution time in seconds
        memory_limit: Maximum memory in KB

    Returns:
        dict with keys: stdout, stderr, compile_output, status, time, memory, exit_code
    """
    language_id = LANGUAGE_IDS.get(language)
    if not language_id:
        return {
            "stdout": "",
            "stderr": f"Unsupported language: {language}",
            "compile_output": "",
            "status": "error",
            "time": "0",
            "memory": "0",
            "exit_code": 1,
        }

    # Encode to base64
    source_b64 = base64.b64encode(source_code.encode()).decode()
    stdin_b64 = base64.b64encode(stdin.encode()).decode() if stdin else ""
    expected_b64 = (
        base64.b64encode(expected_output.encode()).decode()
        if expected_output
        else ""
    )

    payload = {
        "source_code": source_b64,
        "language_id": language_id,
        "stdin": stdin_b64,
        "expected_output": expected_b64,
        "cpu_time_limit": time_limit,
        "memory_limit": memory_limit,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        # Submit
        response = await client.post(
            f"{JUDGE0_API_URL}/submissions?base64_encoded=true&wait=false",
            json=payload,
        )

        if response.status_code != 201:
            return {
                "stdout": "",
                "stderr": f"Judge0 submission failed: {response.status_code}",
                "compile_output": "",
                "status": "error",
                "time": "0",
                "memory": "0",
                "exit_code": 1,
            }

        token = response.json().get("token")
        if not token:
            return {
                "stdout": "",
                "stderr": "No token received from Judge0",
                "compile_output": "",
                "status": "error",
                "time": "0",
                "memory": "0",
                "exit_code": 1,
            }

        # Poll for result
        for _ in range(30):  # Max 30 attempts (15 seconds)
            await asyncio.sleep(0.5)
            result_response = await client.get(
                f"{JUDGE0_API_URL}/submissions/{token}?base64_encoded=true"
            )

            if result_response.status_code != 200:
                continue

            result = result_response.json()
            status = result.get("status", {})
            status_id = status.get("id", 0)

            # Status IDs: 1=In Queue, 2=Processing, 3=Accepted, 4+=Various errors
            if status_id <= 2:
                continue  # Still processing

            # Decode base64 results
            stdout = _decode_b64(result.get("stdout", ""))
            stderr = _decode_b64(result.get("stderr", ""))
            compile_output = _decode_b64(result.get("compile_output", ""))

            return {
                "stdout": stdout.strip(),
                "stderr": stderr.strip(),
                "compile_output": compile_output.strip(),
                "status": status.get("description", "Unknown"),
                "time": result.get("time", "0"),
                "memory": str(result.get("memory", 0)),
                "exit_code": result.get("exit_code", None),
            }

        return {
            "stdout": "",
            "stderr": "Execution timed out",
            "compile_output": "",
            "status": "Time Limit Exceeded",
            "time": str(time_limit),
            "memory": "0",
            "exit_code": None,
        }


async def run_test_cases(
    source_code: str,
    language: str,
    test_cases: list[dict],
) -> list[dict]:
    """Run code against multiple test cases.

    Args:
        source_code: The code to execute
        language: Programming language
        test_cases: List of {input: str, expected_output: str}

    Returns:
        List of test results with pass/fail status
    """
    results = []

    for i, test in enumerate(test_cases):
        result = await submit_code(
            source_code=source_code,
            language=language,
            stdin=test.get("input", ""),
            expected_output=test.get("expected_output", ""),
        )

        passed = (
            result["status"] == "Accepted"
            or result["stdout"] == test.get("expected_output", "").strip()
        )

        results.append(
            {
                "test_case": i + 1,
                "input": test.get("input", ""),
                "expected": test.get("expected_output", ""),
                "actual": result["stdout"],
                "passed": passed,
                "time": result["time"],
                "memory": result["memory"],
                "status": result["status"],
                "error": result["stderr"] or result["compile_output"],
            }
        )

    return results


def _decode_b64(s: Optional[str]) -> str:
    """Safely decode a base64 string."""
    if not s:
        return ""
    try:
        return base64.b64decode(s).decode("utf-8", errors="replace")
    except Exception:
        return s
