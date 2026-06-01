package com.ccmcp.jacg.model;

import java.util.List;

/**
 * 调用链节点 VO
 */
public class CallGraphNode {

    private String method;
    private List<String> related;

    public CallGraphNode(String method, List<String> related) {
        this.method = method;
        this.related = related;
    }

    public String getMethod() { return method; }
    public void setMethod(String method) { this.method = method; }

    public List<String> getRelated() { return related; }
    public void setRelated(List<String> related) { this.related = related; }
}
